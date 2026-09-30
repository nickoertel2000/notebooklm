# Next.js API auf vinext

Diese App nutzt die Next.js-App-Router-API, läuft aber nicht auf Next.js: [vinext](https://github.com/cloudflare/vinext) implementiert sie neu auf Vite 8 und führt sie in workerd (Cloudflare Workers) aus. Das Paket `next` ist nicht installiert; `next/*`-Imports sind vinext-Shims mit Typen aus `vinext/types`.

- Vor der Nutzung eines Next.js-Features, das in der Codebase noch nicht verwendet wird, die vinext-Unterstützung in `node_modules/vinext/README.md` („API coverage“, „What's NOT supported“) prüfen oder `pnpm dlx vinext check` ausführen.
- Es gibt keine `next.config`-Datei: Next-Konfiguration wie `headers` steht inline in `vite.config.ts` unter `vinext({ nextConfig })`. Turbopack-/webpack-Optionen, `runtime`, `maxDuration` und `preferredRegion` haben keine Wirkung. Build-Tooling ist Vite.
- Cloudflare-Bindings und Env: in Server-Code `import { env } from "cloudflare:workers"`, nie `getPlatformProxy()` oder einen eigenen Worker-Entry.
