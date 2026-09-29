---
paths:
  - ".env"
  - ".env.development"
  - ".env.template"
  - "amplify.yml"
  - "amplify/**"
  - "next.config.ts"
  - "package.json"
  - "pnpm-workspace.yaml"
  - ".npmrc"
  - "drizzle.config.ts"
  - "db/index.ts"
  - "lib/s3.ts"
  - "lib/anthropic.ts"
  - "lib/gemini.ts"
  - "lib/voyage.ts"
---

# Environment Variables & Deployment

Server secrets live in `.env.local` (off-limits to you, generated from 1Password via `pnpm env:pull`). Public `NEXT_PUBLIC_` values in `.env` (readable) and `.env.development` (local overrides). There is no central env module — code reads `process.env.X` directly, often at module load.

- Secrets never in client code, never hardcoded (not even as a fallback like `process.env.X ?? "sk_…"`), never logged or returned. Never name a secret `NEXT_PUBLIC_…` — that ends up in the browser bundle.
- Non-secret config with a sensible default (model IDs, concurrency) may use `process.env.X ?? "<default>"`. Existing optional overrides: `GEMINI_TTS_MODEL`, `GEMINI_IMAGE_MODEL`, `VIDEO_SLIDE_CONCURRENCY`, `FFMPEG_PATH`.
- Clients that need a key are created lazily (`getAnthropic()`), so `next build` works without secrets. Keep that for new SDK clients.

## New Variable

| Kind of value                                  | Where                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Public, needed in the browser                  | `NEXT_PUBLIC_…` in `.env` (override in `.env.development` if needed) |
| Secret (key, token, password, connection str.) | `.env.template` as `NAME=op://Development/NotebookLM/NAME`           |

For a secret, copy the format of the existing `.env.template` lines, then tell the user:

> Bitte lege das Feld `NAME` in 1Password unter `Development → NotebookLM` an und führe `pnpm env:pull` aus.

Plus the production step for the current hosting (below). Wait for confirmation before testing code that needs the value.

## Current hosting: AWS Amplify (until the Cloudflare migration)

- The Next.js SSR runtime gets **no** Amplify env vars or secrets automatically. Every runtime variable must be in the `env | grep -e …` list in `amplify.yml` (written to `.env.production` before the build) **and** set as Amplify hosting environment variable. Forgetting the `amplify.yml` entry = variable is `undefined` in production only.
- The worker Lambda gets its values via `secret("NAME")` in `amplify/functions/ingest/resource.ts` (Amplify hosting secrets). Values needed by app and worker (`DATABASE_URL`, API keys) exist in both places.
- `.npmrc` `store-dir=.pnpm-store` + caching only `.pnpm-store` in `amplify.yml`: never cache `node_modules` (pnpm symlinks get duplicated → build OOM at "Collecting build traces").
- `amplify/` is excluded from the root `tsconfig.json`; relative imports inside `amplify/*.ts` need explicit `.ts` extensions (Windows + tsx loader).

## pnpm

- Build scripts are controlled in `pnpm-workspace.yaml` → `allowBuilds`. A new dependency with a postinstall script gets a placeholder there; until it is set to `true`/`false`, **every** `pnpm <script>` fails with `ERR_PNPM_IGNORED_BUILDS`. Pure JS SDKs → `false`.
- `kysely` is pinned to `0.28.17` via `overrides` (better-auth imports exports missing in 0.29.2 → build breaks; better-auth 1.7 needs ≥ 0.28.17). Don't remove the pin without testing the build.
- pnpm 12 supply-chain policy rejects versions younger than 7 days (also transitive ones: `ERR_PNPM_NO_MATCHING_VERSION` although the version exists). When updating, pick the newest version older than 7 days.

## Version limits

- `typescript` stays below 6.1: `typescript-eslint` (via `eslint-config-next`) supports only `<6.1.0`.
- `eslint` stays on 9: `eslint-plugin-react` (via `eslint-config-next`) supports only `^9.7`. `eslint.config.mjs` uses the native flat configs of `eslint-config-next` (no `FlatCompat`).
- `@types/node` follows the runtime's Node major (currently 22).
- `esbuild` is pinned to the version Amplify's Lambda bundling uses (`0.25.12`) — drop the pin with the Cloudflare migration.
- `next` and `eslint-config-next` always on the same version.
