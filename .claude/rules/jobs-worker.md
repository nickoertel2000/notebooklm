---
paths:
  - "workers/jobs/**"
  - "containers/video-renderer/**"
  - "lib/jobs/**"
  - "lib/reports.ts"
  - "lib/audio.ts"
  - "lib/video.ts"
  - "lib/gemini.ts"
  - "lib/anthropic.ts"
  - "lib/voyage.ts"
  - "lib/chunk.ts"
  - "lib/extract.ts"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/reports/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/**"
---

# Async Jobs (Cloudflare Workflows)

Everything long-running (source import, Berichte, Audio-Übersicht, Video-Übersicht) runs as a Workflow in the `notebooklm-jobs` Worker (`workers/jobs/src/workflows/`), never in a request. The app only creates and terminates instances.

## Job flow

1. Route inserts the row with `status: "processing"`, then `startX(params)` from `lib/jobs/start.ts` → responds `202`. If `create()` throws, the route sets the row to `failed` and returns 500.
2. Instance ID = row ID (reports/audio/video). Sources get `${sourceId}-${Date.now()}` because they can be re-imported and IDs are unique per Workflow.
3. Each Workflow: steps with `API_STEP` / `DB_STEP` retry configs (`workflows/shared.ts`); the `run()` body is wrapped in try/catch, the catch runs a `mark-failed` step (`toErrorMessage`: NUL-stripped, 500 chars) and rethrows so the instance ends as errored. Validation problems throw `NonRetryableError`.
4. Deleting a processing report/audio/video calls `cancelJob(kind, id)` (terminate, errors ignored); `deleteNotebook` cancels all running ones. Deleted sources are detected by the import itself (`assertSourceExists` → `NonRetryableError`).
5. Client polls the list endpoint only while an item is `processing` (`NotebookView.tsx`: sources 2.5 s, reports 3 s, audio 4 s, video 5 s).
6. Stale healing in the list `GET` stays as a safety net (sources 15 min via `updatedAt`, reports 10, audio 15, video 20 min via `createdAt`) – thresholds must exceed the worst case including step retries. A new job type needs the same.

## Workflow rules

- Step return values are persisted (max 1 MB, JSON only): return small metadata, write binary data to R2 inside the step. Everything outside `step.do` may re-run on replay – keep it deterministic (lookups, no I/O).
- Steps must be idempotent: the import writes chunks first without embedding, `embed-n` only fills rows `WHERE embedding IS NULL` in its `idx` range.
- Create a DB client per step (`getDb()`), never share it across steps.
- Parallel steps are fine (`Promise.all` over `step.do`), used for video slides in groups of `VIDEO_SLIDE_CONCURRENCY`.
- The Worker's memory limit is 128 MB: the PDF upload limit (50 MB, `sources/[sourceId]/file`) keeps the whole file in memory during `extract`.
- Strip NUL bytes (`stripNul`) from extracted text and error strings before any DB write – Postgres rejects `0x00` (22021). Never write a literal NUL into source code.

## Ingestion

PDF via `unpdf` (`mergePages: true`, so `page` is always `null`), else `TextDecoder`. URL sources are extracted in the route (`lib/extract.ts`, linkedom + Readability) and stored as `content.txt`. `chunkText`: 3200 chars, 400 overlap. Embeddings in batches of 100 (`embedTexts`, `input_type: "document"`; queries use `embedQuery`), written with one `UPDATE … FROM (VALUES …)` per batch.

## Generation

- Reports/Audio/Video don't use vector search: `buildContext` (`lib/jobs/context.ts`) loads all chunks of the selected sources up to 150k chars.
- Models come from Worker `vars` (`CLAUDE_MODEL`, `CLAUDE_REPORT_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_IMAGE_MODEL`) via `chatModel()`/`reportModel()`/`env`. Never hardcode model IDs.
- Audio: script must start with a `TITEL:` line and contain no Markdown (`parseScript`). `SPEAKER_LABELS` in `lib/audio.ts` must match the speaker names configured in `lib/gemini.ts`. Gemini returns raw PCM 24 kHz/16 bit/mono, wrapped into WAV by `pcmToWav`.
- Video: `lib/video.ts` holds formats, styles, prompts, parsing and the text layout (`layoutSlide`). Per slide TTS + image are written to `notebooks/{nb}/video/{id}/parts/`; a failed image falls back to a solid background. The `render` step posts multipart (manifest + files) to the container and streams the MP4 via `FixedLengthStream` into R2; `parts/` is deleted in `finally`.
- Container `containers/video-renderer`: Node 24 (type stripping, no build step, only `node:*` imports) + apt ffmpeg, font baked into the image. Text via `drawtext` with `textfile=` + `expansion=none`. It is a dumb renderer: no API keys, no R2 access. Own tsconfig (`pnpm typecheck` covers it).
- Prompts are German and live next to their format definitions (`REPORT_TYPES`, `AUDIO_FORMATS`, `VIDEO_FORMATS`). A new format = new entry there + option in the matching modal in `components/popup/`.
