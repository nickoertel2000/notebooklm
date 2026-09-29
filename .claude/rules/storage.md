---
paths:
  - "lib/s3.ts"
  - "amplify/storage/**"
  - "app/api/notebooks/*/sources/**"
  - "app/api/notebooks/*/audio/**"
  - "app/api/notebooks/*/video/**"
  - "components/popup/AddSourceModal.tsx"
  - "components/AudioPlayer/**"
  - "components/VideoPlayer/**"
---

# File Storage

Currently AWS S3 via `lib/s3.ts` (to be replaced by Cloudflare R2, see `cloudflare-migration.md`). The DB stores the **key**, never a URL.

## Key schema

All objects live under `notebooks/{notebookId}/` — this prefix is what `deleteNotebook` removes and what the worker dispatches on:

- `sources/{sourceId}/{filename}` — uploaded files; URL/text sources as `content.txt`
- `jobs/{report|audio|video}/{id}.json` — job files, deleted by the worker
- `audio/{audioId}.wav`, `video/{videoId}.mp4` — generated output

Build keys with the helpers (`sourceKey`, `audioKey`, `videoKey`), not with inline template strings.

## Flows

- Upload: client `POST /sources` → route creates the `sources` row + `presignUpload(key, contentType)` (PUT, 600 s) → client PUTs the file directly to the bucket. The bucket needs CORS for that; it is configured outside the repo.
- Download/playback: `GET audio/[audioId]` / `video/[videoId]` returns `presignDownload(key)` (3600 s). Never expose the bucket publicly or return raw keys.
- Delete: `deleteObject` for single files, `deleteByPrefix` (paginated) for whole notebooks. Storage errors on delete are logged, the DB delete still happens.
