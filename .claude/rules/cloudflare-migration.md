---
paths:
  - "amplify/**"
  - "amplify.yml"
  - "wrangler.jsonc"
  - "open-next.config.ts"
  - "cloudflare-env.d.ts"
  - "next.config.ts"
  - "db/index.ts"
  - "lib/s3.ts"
  - "lib/videoRender.ts"
  - "scripts/worker-local.ts"
  - "package.json"
---

# Cloudflare Migration (planned)

The whole project moves from AWS (Amplify, S3, Lambda) to Cloudflare. This rule describes the current AWS parts, what they map to and what still has to be decided. Once the migration is done, replace this file with a rule describing the Cloudflare setup (like `env-und-cloudflare.md` in WINTERSUMMERJOBS).

Reference project already on Cloudflare: `C:\Users\nick.oertel\Documents\GitHub\WINTERSUMMERJOBS` (OpenNext on Workers, `wrangler.jsonc`, Hyperdrive via `getDb()`, R2, separate cron Worker, `pnpm cf-typegen` → `cloudflare-env.d.ts`). Check its patterns before inventing new ones.

## Mapping

| Today (AWS)                                               | Cloudflare target                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Amplify Hosting (Next.js SSR, 30 s limit)                 | Worker via OpenNext or vinext (open decision)                                    |
| `db/index.ts` module-level `postgres()` singleton         | Hyperdrive binding, client per request (`getDb()` like WINTERSUMMERJOBS)         |
| S3 + `@aws-sdk/*` (`lib/s3.ts`)                           | R2 binding for server-side reads/writes; presigned URLs via R2's S3 API          |
| S3 upload event → Lambda `ingest`                         | Route enqueues directly (Queues) → consumer Worker; or R2 event notifications    |
| Lambda 600 s for reports/audio/ingest                     | Queue consumer / Workflows (steps with retries) instead of one long invocation   |
| ffmpeg (`lib/videoRender.ts`: `child_process`, `fs`, tmp) | Not possible in a Worker → Cloudflare Containers/Sandbox or an external renderer |
| Amplify env vars + `amplify.yml` grep, Lambda `secret()`  | `vars` in `wrangler.jsonc` + `wrangler secret put`                               |
| `scripts/worker-local.ts` (polls S3)                      | `wrangler dev` for the consumer Worker                                           |

## Known blockers / things to check

- `lib/videoRender.ts` is the only hard blocker (native binary, filesystem). Everything else in the worker (Claude, Gemini TTS/image, Voyage, `unpdf`, linkedom/Readability) is fetch/pure JS.
- `Buffer` in `lib/gemini.ts`, `lib/s3.ts`, `lib/videoRender.ts` → needs `nodejs_compat` or a switch to `Uint8Array`.
- `process.env` is read at module load (`CHAT_MODEL`, `REPORT_MODEL`, `BUCKET`, S3 client, `db`). Verify availability at global scope on Workers, otherwise move to lazy per-request access.
- `prepare: false` for the Supabase pooler is only set in the worker, not in `db/index.ts` — decide together with Hyperdrive.
- Remove Amplify-only settings: `export const runtime = "nodejs"` / `maxDuration` in routes, `serverExternalPackages` in `next.config.ts`, `.npmrc` `store-dir`, `amplify.yml`, `amplify/`, `@aws-amplify/*`, `@types/aws-lambda`, `cross-env`, `esbuild` pin.
- `kysely` pin (`pnpm-workspace.yaml`) was a Turbopack build workaround — re-test with the new build pipeline before removing.
- `middleware.ts` → `proxy.ts` (Next 16 deprecation): `proxy` runs only on the Node runtime. Check whether the chosen adapter (OpenNext/vinext) supports it before renaming; until then `middleware.ts` stays.
- Job trigger: the job-file-in-bucket pattern (`jobs/{kind}/{id}.json`) only exists because of the S3 trigger. With Queues the route sends the message directly; the DB status flow (`processing → ready | failed`, polling, stale healing) stays.
- Storage keys (`notebooks/{nb}/…`) stay unchanged so data can be copied from S3 to R2 1:1.
- New domain → Google OAuth redirect URI, `NEXT_PUBLIC_APP_URL`, R2 CORS for browser PUT uploads.

Every architecture decision here (OpenNext vs. vinext, Queues vs. Workflows, video rendering) is the user's call — propose options with trade-offs, don't pick silently.
