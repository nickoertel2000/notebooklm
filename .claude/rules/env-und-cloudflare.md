---
paths:
  - ".env.production"
  - ".env.development"
  - ".env.template"
  - "wrangler.jsonc"
  - "workers/jobs/wrangler.jsonc"
  - "vite.config.ts"
  - "package.json"
  - "pnpm-workspace.yaml"
  - "tsconfig.json"
  - "drizzle.config.ts"
  - "db/index.ts"
  - "proxy.ts"
  - "lib/gemini.ts"
  - "lib/embeddings.ts"
  - "lib/tavily.ts"
  - "lib/storage.ts"
  - "scripts/cf.mjs"
  - "**/worker-configuration.d.ts"
---

# Environment Variables & Cloudflare

## Setup

- Two Workers, one Cloudflare account ("Accounts@nickoertel.de", Workers Paid):
  - `notebooklm` (`wrangler.jsonc`): the vinext app, entry `vinext/server/fetch-handler`. Bindings `HYPERDRIVE`, `BUCKET` (R2 `notebooklm`, jurisdiction `eu`), `ASSETS`, four Workflow bindings with `script_name: "notebooklm-jobs"`.
  - `notebooklm-jobs` (`workers/jobs/wrangler.jsonc`): declares the Workflows in `exports` (wrangler ≥ 4.139) plus the `VideoRenderer` container/Durable Object. `limits.cpu_ms: 300000`.
- Config format is `wrangler.jsonc`, deliberately not vinext's `cloudflare.config.ts`: that format (`@cloudflare/config`, `cf` CLI) is still marked unstable/beta. Revisit once it's stable.
- Local dev: `pnpm dev` = one Vite dev server; the jobs Worker runs as `auxiliaryWorkers` in `vite.config.ts`. Containers are only enabled locally when `docker info` succeeds. The `AI` binding (Workers AI, slide images) always runs against Cloudflare, also locally, and uses the same daily free allocation.
- Deployment: Cloudflare Workers Builds, production branch `I-######-I-PRODUKTION-I-######-I` (merge = deploy), builds for other branches off. App: root dir = repo root, `pnpm check && pnpm build` / `pnpm run deploy:app`. Jobs: same checks before the build (deploy gate, see `tests.md`), root dir `workers/jobs` (Builds checks the Worker `name` in the root dir's wrangler config), commands `cd ../.. && …` because there is no package.json there. Both deploy the Vite build output (`dist/server/wrangler.json`, `dist/notebooklm_jobs/wrangler.json`) with plain `wrangler deploy`; never use `pnpm deploy` (pnpm builtin).
- No Docker needed locally: the container image is built by Workers Builds during the jobs Worker's `wrangler deploy`. `pnpm cf:first-deploy` (`scripts/cf.mjs`) does the very first deploy of both Workers with `--secrets-file` (required secrets are validated at deploy, so they must ship with the first version) and `--containers-rollout=none` for the jobs Worker. Order matters: jobs before app (Workflow bindings need the target script).
- Production URL: `https://notebooklm.fancy-cherry-09d8.workers.dev` (= `NEXT_PUBLIC_APP_URL` in `.env.production`, Google OAuth redirect URI).

## Reading env in code

- Always `import { env } from "cloudflare:workers"`, never `process.env` in runtime code (only `NEXT_PUBLIC_*`, which vinext inlines). Read inside functions or lazy getters, not at module load (`getGemini()`, `chatModels()`).
- Model IDs and other non-secret config are `vars` in the Worker config, per Worker (a var needed by both Workers goes into both files, with the identical value: the generated types are literal types and merge into one `Cloudflare.Env`). No defaults in code.
- Types: `pnpm cf-typegen` after every config change. It writes `worker-configuration.d.ts` (app, includes runtime types and the jobs Workflow payload types) and `workers/jobs/worker-configuration.d.ts` (`JobsEnv`, no runtime types). Both merge into the global `Cloudflare.Env`, so shared `lib/` code sees the union of both Workers; Workflow classes use `WorkflowEntrypoint<JobsEnv, …>` for the precise type.
- Workers runtime types make `Response.json()` return `unknown`. Server: `readJsonBody()` + field checks (`lib/api/body.ts`). Client: `readJson<T>()` / `readError()` (`lib/api/client.ts`).
- `next` is not installed; `next/*` types come from `vinext/types` (tsconfig `types`).

## Secrets

Local secrets live in `.env.local` (never read its contents; processes may load it, generated from 1Password via `pnpm env:pull`). Wrangler/Vite read it for the local Workers too; `vite build` copies the values into the gitignored `dist/*/.dev.vars` for `pnpm preview` – never commit `dist/`. Production secrets are Worker secrets (`secrets.required` in each config lists them).

- Secrets never in client code, never hardcoded (not even as a fallback), never logged or returned. Never name a secret `NEXT_PUBLIC_…`.
- `DATABASE_URL` / `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` must be a direct Postgres connection, never a transaction pooler: Hyperdrive pools itself and uses prepared statements. For Neon: "Connection pooling" off, host without `-pooler`, `sslmode=require`; the Hyperdrive config is "public" (no Workers VPC / Access). Production DB credentials live only in the Hyperdrive config, not as Worker secrets.

## New Variable

| Kind of value                                  | Where                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Public, needed in the browser                  | `NEXT_PUBLIC_…` in `.env.production` and `.env.development` (both committed)    |
| Non-secret config (model ID, limit)            | `vars` in the Worker config(s), then `pnpm cf-typegen`                          |
| Secret (key, token, password, connection str.) | `.env.template` as `NAME=op://Development/NotebookLM/NAME` + `secrets.required` |
| Cloudflare resource (R2, Workflow, …)          | Binding in the Worker config, then `pnpm cf-typegen`                            |

For a secret, tell the user:

> Bitte lege das Feld `NAME` in 1Password unter `Development → NotebookLM` an, führe `pnpm env:pull` aus und für Produktion `pnpm cf:secrets` (den Namen vorher in `scripts/cf.mjs` ergänzen).

Wait for confirmation before testing code that needs the value.

## pnpm

- Build scripts are controlled in `pnpm-workspace.yaml` → `allowBuilds`. A new dependency with a postinstall script gets a placeholder there; until it is set to `true`/`false`, **every** `pnpm <script>` fails with `ERR_PNPM_IGNORED_BUILDS`. Pure JS SDKs → `false`. `workerd` must stay `true`.
- `kysely` is pinned to `0.28.17` via `overrides` (better-auth imports exports missing in 0.29.x). Don't remove the pin without testing the build.
- pnpm 12 supply-chain policy rejects versions younger than 7 days (also transitive ones). When updating, pick the newest version older than 7 days.

## Version limits

- `typescript` stays below 6.1: `typescript-eslint` (via `eslint-config-next`) supports only `<6.1.0`.
- `eslint` stays on 9: `eslint-plugin-react` (via `eslint-config-next`) supports only `^9.7`.
- `@types/node` follows the Node major used locally and in the container image (22 locally, container `node:24-slim`).
- vinext targets Vite 8 (Rolldown/Oxc); don't add old `esbuild`/`rollupOptions` config.
