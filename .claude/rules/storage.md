---
paths:
  - "lib/storage.ts"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/AddSourceModal.tsx"
  - "components/AudioPlayer/**"
  - "components/VideoPlayer/**"
---

# File Storage (R2)

Cloudflare R2 bucket `notebooklm` (jurisdiction `eu`), accessed only through the `BUCKET` binding via `lib/storage.ts` – no S3 API, no credentials, no presigned URLs, no bucket CORS. The DB stores the **key** (`storageKey`), never a URL.

## Key schema

All objects live under `notebooks/{notebookId}/` – this prefix is what `deleteNotebook` removes:

- `sources/{sourceId}/original.pdf` – uploaded PDFs (fixed name, the user's filename never goes into the key); URL/text sources as `content.txt`
- `audio/{audioId}.wav`, `video/{videoId}.mp4` – generated output
- `video/{videoId}/parts/` – temporary slide audio/images of a running video job

Build keys with the helpers (`sourceKey`, `sourcePrefix`, `audioKey`, `videoKey`, `videoPartsPrefix`, `notebookPrefix`), not with inline template strings.

## Flows

- Upload: `POST sources` creates the row → client `PUT sources/[sourceId]/file` with `Content-Type: application/pdf` → the route streams the body into R2 (max 50 MB, only once per source) and starts the import Workflow.
- Download/playback: `GET audio/[audioId]` / `video/[videoId]` return metadata with `url: …/file`; the `file` route checks ownership and streams via `serveObject` (Range → 206, ETag → 304, `Cache-Control: private, no-store`). Never return raw keys or expose the bucket publicly.
- Delete: `deleteObject` for single files, `deleteByPrefix` (paginated) for a source folder or a whole notebook. Storage errors on delete are logged, the DB delete still happens.
