---
paths:
  - "workers/jobs/**"
  - "containers/video-renderer/**"
  - "lib/jobs/**"
  - "lib/reports.ts"
  - "lib/studio.ts"
  - "lib/audio.ts"
  - "lib/video.ts"
  - "lib/gemini.ts"
  - "lib/embeddings.ts"
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

PDF via `unpdf` (`mergePages: true`, so `page` is always `null`), else `TextDecoder`. URL sources are extracted in the route (`lib/extract.ts`, linkedom + Readability) and stored as `content.txt`. `chunkText`: 3200 chars, 400 overlap. Embeddings in batches of 25 with a 60 s `step.sleep` in between (`embedTexts(…, "document")`; queries use `embedQuery`), written with one `UPDATE … FROM (VALUES …)` per batch. Gemini Embedding allows 30k tokens/min, shared with the chat's query embeddings; a larger batch fails on its own because one request exceeds the minute budget. Each `embed-n` step bumps `sources.updatedAt`, otherwise the 15-min stale healing kills long imports. `lib/embeddings.ts`: Gemini Embedding 2 has no `taskType`, the purpose is a text prefix; every text must be its own `Content` object, a plain `string[]` would return one merged vector.

## Generation

- Reports/Audio/Video don't use vector search: `buildContext` (`lib/jobs/context.ts`) loads all chunks of the selected sources up to 150k chars.
- Models come from Worker `vars` via `chatModels()`/`reportModels()`/`env`. Never hardcode model IDs. Text and TTS models are comma-separated fallback chains (`GEMINI_CHAT_MODELS` in the app, `GEMINI_REPORT_MODELS` and `GEMINI_TTS_MODELS` in the jobs Worker); `GEMINI_EMBEDDING_MODEL` and `IMAGE_MODEL` are single models.
- Text generation goes through `generateText()` (`lib/gemini.ts`). Gemini's thinking tokens count against `maxOutputTokens`: small budgets need `minimalThinking`, script budgets are set generously (the prompt controls the length).
- Everything runs on the Gemini free tier. Don't enable billing on that Google project: it makes every call of the project paid, there is no free quota inside a paid project.
- Free-tier quotas are per project **and per model** (AI Studio → Usage → Rate Limit). Every Flash version (3.5–3.8) has its own 5 RPM / 20 RPD, Flash-Lite (3.1, 3.5) 15 RPM / 500 RPD. So `GEMINI_REPORT_MODELS` (Flash chain, ends on Flash-Lite) is reserved for Studio content (reports, audio/video scripts); everything frequent (chat, auto-title, icon, discover, report suggestions) uses `GEMINI_CHAT_MODELS` (Flash-Lite only). Don't move a frequent call to `reportModels()`.
- `getGemini()` sets SDK `retryOptions` (3 attempts, 5xx only; without them the SDK doesn't retry at all). 429 is not retried: it's the quota. `withFallback(models, run)` walks the chain on 429/5xx; `generateText()`, the chat and `synthesizeSpeech()` use it. A chain whose models share one quota is useless: each entry needs its own quota.
- Gemini TTS allows 3 RPM and 10 RPD per model; the chain has four TTS models (3.8 Flash, 3.8 Flash-Lite, 3.1 Flash preview, 2.5 Flash preview), so about 40 requests a day, and every video slide is one request. That's why there is only the short video format (3–4 slides, `MAX_SLIDES = 4`) and the Video Workflow voices all slides first, one after another with a 20 s `step.sleep` (`speech-pause-n`), before generating any image (`image-n`): a TTS failure then costs no Workers AI neurons. Don't add longer video formats or parallel TTS without solving that first.
- `ThinkingLevel.MINIMAL` (`minimalThinking`) is supported by Flash-Lite but not by `gemini-3.8-flash` (only low/medium/high): use it only with `chatModels()`, and keep that chain Flash-Lite only.
- Audio: script must start with a `TITEL:` line and contain no Markdown (`parseScript`). The two-speaker request format depends on the model: `synthesizeSpeech()` first sends one part per turn with `speechMetadata.speaker` (`splitDialog`), which `gemini-3.8-flash-lite-tts` requires (a labelled text block or any part without speaker → 400). On 400 "Speech metadata is not supported" (3.1/2.5 TTS) it retries the same model with one text block `Sprecher n: …` plus an instruction line. `tts.test.ts` covers both paths; test a new TTS model with a real dialog request before adding it to the chain. Gemini 3.8 TTS returns WAV (older models raw PCM), always 24 kHz/16 bit/mono: `stripWavHeader` removes an existing header, then `pcmToWav` writes exactly one 44-byte header (`wavSeconds` in the Video Workflow relies on that).
- Video: `lib/video.ts` holds formats, styles, prompts, parsing and the text layout (`layoutSlide`). Per slide TTS and image are written to `notebooks/{nb}/video/{id}/parts/`; a failed image falls back to a solid background.
- Slide images: Workers AI (`AI` binding, FLUX.2 via multipart, `workers/jobs/src/images.ts`), because no Gemini image model has a free tier. The output format is detected from the magic bytes and passed to the container as `slide.background` (file extension). Step `image-budget` keeps the daily free allocation: every video created today (UTC) counts with `MAX_SLIDES`; above `IMAGE_DAILY_LIMIT` the whole video gets solid backgrounds. The `render` step posts multipart (manifest + files) to the container and streams the MP4 via `FixedLengthStream` into R2; `parts/` is deleted in `finally`.
- Container `containers/video-renderer`: Node 24 (type stripping, no build step, only `node:*` imports) + apt ffmpeg, font baked into the image. Text via `drawtext` with `textfile=` + `expansion=none`. Each clip is cut with `-t` to the slide's audio length (`seconds` in the manifest, from `wavSeconds`); never `-shortest`: at 2 fps libx264's lookahead makes every clip ~22 s longer than its audio. It is a dumb renderer: no API keys, no R2 access. Own tsconfig (`pnpm typecheck` covers it).
- Prompts are German and live next to their format definitions (`REPORT_TYPES`, `AUDIO_FORMATS`, `VIDEO_FORMATS`, `STUDIO_FORMATS`). A new format = new entry there + option in the matching modal in `components/popup/`.
- Study formats (`lib/studio.ts`: Karteikarten, Quiz, Datentabelle, Mindmap) run through `ReportWorkflow` with `ReportParams.format`: `generateText({ jsonSchema })` forces JSON, `parseStudioContent` validates and normalizes it, and invalid output throws so the step retries. Gemini's JSON schemas can't be recursive, so the mindmap depth (4 levels) is spelled out in `STUDIO_SCHEMAS`; the parser caps it at the same depth. Keep schema, parser and the views (`components/*View`) in sync when changing a format.
