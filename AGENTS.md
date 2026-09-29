# Next.js API on vinext

This app uses the Next.js App Router API, but it does not run on Next.js: [vinext](https://github.com/cloudflare/vinext) reimplements it on Vite 8 and runs it in workerd (Cloudflare Workers). The `next` package is not installed; `next/*` imports are vinext shims with types from `vinext/types`.

- Before using a Next.js feature that isn't already used in the codebase, check its vinext support in `node_modules/vinext/README.md` ("API coverage", "What's NOT supported") or run `pnpm dlx vinext check`.
- `next.config`, Turbopack/webpack options, `runtime`, `maxDuration` and `preferredRegion` have no effect. Build tooling is Vite (`vite.config.ts`).
- Cloudflare bindings and env: `import { env } from "cloudflare:workers"` in server code, never `getPlatformProxy()` or a custom worker entry.
