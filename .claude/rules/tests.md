---
paths:
  - "**/*.test.ts"
  - "vitest.config.ts"
  - "test/**"
  - ".github/workflows/**"
---

# Tests (Vitest)

- Unit tests only, for pure logic without DB, R2, network or AI calls: parsers for model output, chunking, citation mapping, WAV handling, model chains, input validation. They sit next to the code as `lib/<name>.test.ts`.
- `vitest.config.ts` is separate from `vite.config.ts` on purpose: tests run in Node without vinext and the Cloudflare plugin. `cloudflare:workers` is aliased to `test/cloudflare-workers.ts` (an empty `env` object); a test that needs env values sets them with `Object.assign(env, { … })`, because the generated `Cloudflare.Env` types are string literals.
- Code that should be tested but lives in a route file moves to `lib/` (example: `lib/citations.ts` out of the chat route). Route files only export handlers.
- Never write a literal NUL into a test either, use `String.fromCharCode(0)`.
- No E2E suite: it would need its own database (Neon branch) and would burn the daily Gemini quotas. Don't add tests that create data in the production DB or call real APIs.
- Deploy gate: the Workers Builds build commands of both Workers run `pnpm lint && pnpm typecheck && pnpm test` before `pnpm build`, so a red check stops the deploy of both. GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every push to `main`, for early feedback and the README badge; it does not block anything.
