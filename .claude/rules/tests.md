---
paths:
  - "**/*.test.ts"
  - "vitest.config.ts"
  - "test/**"
  - "e2e/**"
  - "playwright.config.ts"
  - ".github/workflows/**"
---

# Tests (Vitest)

- Unit tests only, for pure logic without DB, R2, network or AI calls: parsers for model output, chunking, citation mapping, WAV handling, model chains, input validation. They sit next to the code as `lib/<name>.test.ts`.
- `vitest.config.ts` is separate from `vite.config.ts` on purpose: tests run in Node without vinext and the Cloudflare plugin. `cloudflare:workers` is aliased to `test/cloudflare-workers.ts` (an empty `env` object); a test that needs env values sets them with `Object.assign(env, { … })`, because the generated `Cloudflare.Env` types are string literals.
- Code that should be tested but lives in a route file moves to `lib/` (example: `lib/citations.ts` out of the chat route). Route files only export handlers.
- Never write a literal NUL into a test either, use `String.fromCharCode(0)`.
- Unit tests never create data in the production DB or call real APIs.

# E2E (Playwright)

- `e2e/*.spec.ts`, run with `pnpm test:e2e` against a throwaway Postgres on `localhost:5433`: locally `docker compose up -d` (`compose.yaml`, tmpfs, starts empty), in CI the service container of the job `e2e` on the same port. `E2E_DATABASE_URL` overrides it; `playwright.config.ts` refuses non-local hosts. Docker isn't installed on the user's machine, so you can't run them locally; verify via CI.
- Protection against production: the dev server still loads `.env.local`, but process env wins over it (wrangler `loadDotEnv`). So `webServer.env` must override every secret in `secrets.required` of both Workers and the Hyperdrive connection string; a new required secret goes there too. `reuseExistingServer: false`, because a running `pnpm dev` talks to production.
- `e2e/global-setup.ts` runs the Drizzle migrations and seeds the demo template (`DEMO_TEMPLATE_EMAIL` read from `wrangler.jsonc`) with a ready source, a chunk without embedding and a chat answer with citation `[1]`. Texts the specs assert on live in `e2e/seed-data.ts`.
- Playwright starts `pnpm dev` with `E2E=1`: `vite.config.ts` then turns off remote bindings (Workers AI) and containers, so no Cloudflare login is needed. Gemini/Tavily get placeholder keys: tests never wait for AI results (ingestion ends `failed` in the background, auto-title is swallowed). Tests assert only what happens without AI.
- One worker: `POST /api/demo` is rate-limited to 2 accounts per minute per IP, so at most one test uses the demo access. Other tests register their own account via `register()` (`e2e/helpers.ts`).
- The dev server compiles client code on first request: clicks before hydration are lost silently (buttons do nothing, forms submit natively, `Link` does a full load). After every full page load call `gotoPage()` / `waitForHydration()` / `expectHome()` from `e2e/helpers.ts`. CSS-only effects (tooltips on hover) work without hydration and prove nothing.
- An empty notebook opens the add-source dialog on its own; don't click "Quellen hinzufügen" there.
- Locators use visible German texts and `aria-label`s; CSS-module classes only by original name (`toHaveClass(/sourceItemActive/)`, scoped names keep it).
- Deploy gate: the Workers Builds build commands of both Workers run `pnpm check` (lint, typecheck, tests) before `pnpm build`, so a red check stops the deploy of both. GitHub Actions (`.github/workflows/ci.yml`) runs the same checks plus the E2E job on every push to `main`, for early feedback and the README badge; it does not block anything.
