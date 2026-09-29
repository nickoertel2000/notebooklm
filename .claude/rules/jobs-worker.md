---
paths:
  - "amplify/functions/**"
  - "scripts/**"
  - "lib/reports.ts"
  - "lib/audio.ts"
  - "lib/video.ts"
  - "lib/videoRender.ts"
  - "lib/gemini.ts"
  - "lib/anthropic.ts"
  - "lib/voyage.ts"
  - "lib/chunk.ts"
  - "lib/extract.ts"
  - "lib/fontData.ts"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/reports/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/**"
---

# Async Jobs & Worker

Everything long-running (source ingestion, Berichte, Audio-Übersicht, Video-Übersicht) runs in one worker, `amplify/functions/ingest/handler.ts` (Lambda, 600 s, 2 GB), never in a request. Current trigger: S3 upload event. With the Cloudflare migration the trigger/runtime changes (see `cloudflare-migration.md`), but the job flow below stays.

## Job flow

1. Route inserts a row with `status: "processing"` and writes a job file `notebooks/{nb}/jobs/{report|audio|video}/{id}.json` via `putText` → responds `202`.
2. Worker dispatches on the key: `parts[2] === "sources"` → `processSource`, `"jobs"` → `processJob` (by `kind`). Every other prefix is ignored on purpose, so files the worker writes itself (`audio/*.wav`, `video/*.mp4`) don't retrigger it. New output files must not land under `sources/` or `jobs/`.
3. Worker sets `ready` (+ result columns) or `failed` + `error` (sliced to 500 chars), deletes the job file in `finally`.
4. Client polls the list endpoint only while an item is `processing` (`NotebookView.tsx`: sources 2.5 s, reports 3 s, audio 4 s, video 5 s).
5. Stale healing: the list `GET` sets rows stuck in `processing` longer than `STALE_PROCESSING_MS` to `failed` (reports 5 min, audio 8 min, video 10 min) — otherwise the client polls forever. A new job type needs the same.

Retry of a source: `POST sources/[sourceId]` deletes partial chunks, resets the status and calls `retriggerIngest` (S3 self-copy with `MetadataDirective: "REPLACE"` to fire a new event).

## Worker pitfalls

- The worker and everything it imports (`lib/*` listed in `paths`) use **relative imports**, no `@/` alias — the Lambda bundler/type-check doesn't know it (see `lib/gemini.ts` → `./audio`).
- The worker builds its own `drizzle(postgres(url, { prepare: false }))` — the Supabase transaction pooler doesn't support prepared statements. Don't import `@/db` there.
- Strip NUL bytes (`stripNul`) from extracted text **and** from error strings before any DB write — Postgres rejects `0x00` in text columns (22021), and the failed `UPDATE` would leave the row stuck. Never write a literal NUL into source code; use `String.fromCharCode(0)`.
- Bucket name comes from the event record, not from `S3_BUCKET_NAME` — referencing the bucket in the function env creates an Amplify stack cycle storage ↔ function.
- `scripts/worker-local.ts`: `dotenv` must load `.env.local` **before** the dynamic `import()` of the handler (the handler creates the DB client at module load). Locally only `jobs/` files are processed; source ingestion needs the real S3 event.

## Ingestion

PDF via `unpdf` (`mergePages: true`, so `page` is always `null`), else `TextDecoder`. URL sources are extracted in the route (`lib/extract.ts`, linkedom + Readability) and stored as `content.txt`. `chunkText`: 3200 chars, 400 overlap. Embeddings in batches of 100 (`embedTexts`, `input_type: "document"`; queries use `embedQuery`).

## Generation

- Reports/Audio/Video don't use vector search: `buildContext` loads all chunks of the selected sources up to `MAX_CONTEXT_CHARS` (150k).
- Models from env with defaults: `CLAUDE_MODEL` (chat, auto-title), `CLAUDE_REPORT_MODEL` (reports, scripts, discover, suggestions), `GEMINI_TTS_MODEL`, `GEMINI_IMAGE_MODEL`. Never hardcode model IDs elsewhere.
- Audio: script must start with a `TITEL:` line and contain no Markdown (`parseScript`). `SPEAKER_LABELS` in `lib/audio.ts` must match the speaker names configured in `lib/gemini.ts`. Gemini returns raw PCM 24 kHz/16 bit/mono, wrapped into WAV by `pcmToWav`.
- Video: `lib/video.ts` is runtime-agnostic (formats, styles, prompts, parsing); `lib/videoRender.ts` is Node-only (`child_process` + ffmpeg, `fs`, tmp dir) and must never be imported from app/client code. ffmpeg path: `FFMPEG_PATH` (Lambda layer) else `ffmpeg-static`. Text is drawn via `drawtext` with `textfile=` + `expansion=none` (avoids Windows path escaping); the font is embedded as base64 in `lib/fontData.ts`.
- Prompts are German and live next to their format definitions (`REPORT_TYPES`, `AUDIO_FORMATS`, `VIDEO_FORMATS`). A new format = new entry there + option in the matching modal in `components/popup/`.
