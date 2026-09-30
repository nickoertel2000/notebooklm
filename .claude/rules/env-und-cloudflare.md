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

# Umgebungsvariablen & Cloudflare

## Setup

- Zwei Worker, ein Cloudflare-Account (Workers Paid, für Container erforderlich):
  - `notebooklm` (`wrangler.jsonc`): die vinext-App, Entry `vinext/server/fetch-handler`. Bindings `HYPERDRIVE`, `BUCKET` (R2 `notebooklm`, Jurisdiction `eu`), `ASSETS`, vier Workflow-Bindings mit `script_name: "notebooklm-jobs"`.
  - `notebooklm-jobs` (`workers/jobs/wrangler.jsonc`): deklariert die Workflows in `exports` (wrangler ≥ 4.139) sowie den `VideoRenderer`-Container/Durable Object. `limits.cpu_ms: 300000`.
- Das Konfigurationsformat ist `wrangler.jsonc`, bewusst nicht vinext' `cloudflare.config.ts`: Dieses Format (`@cloudflare/config`, `cf`-CLI) ist noch als instabil/Beta markiert. Neu bewerten, sobald es stabil ist.
- Lokale Entwicklung: `pnpm dev` = ein Vite-Dev-Server; der Jobs-Worker läuft als `auxiliaryWorkers` in `vite.config.ts`. Container sind lokal nur aktiviert, wenn `docker info` erfolgreich ist. Das `AI`-Binding (Workers AI, Folienbilder) läuft immer gegen Cloudflare, auch lokal, und nutzt dieselbe tägliche Gratis-Zuteilung.
- Deployment: Cloudflare Workers Builds, Produktions-Branch `I-######-I-PRODUKTION-I-######-I` (Merge = Deploy), Builds für andere Branches aus. App: Root-Verzeichnis = Repo-Root, `pnpm check && pnpm build` / `pnpm run deploy:app`. Jobs: dieselben Prüfungen vor dem Build (Deploy-Gate, siehe `tests.md`), Root-Verzeichnis `workers/jobs` (Builds prüft den Worker-`name` in der wrangler-Konfiguration des Root-Verzeichnisses), Befehle `cd ../.. && …`, weil dort keine package.json liegt. Beide deployen die Vite-Build-Ausgabe (`dist/server/wrangler.json`, `dist/notebooklm_jobs/wrangler.json`) mit einfachem `wrangler deploy`; nie `pnpm deploy` verwenden (pnpm-Builtin).
- Lokal wird kein Docker benötigt: Das Container-Image wird von Workers Builds während des `wrangler deploy` des Jobs-Workers gebaut. `pnpm cf:first-deploy` (`scripts/cf.mjs`) führt das allererste Deploy beider Worker mit `--secrets-file` aus (erforderliche Secrets werden beim Deploy validiert, müssen also mit der ersten Version ausgeliefert werden) und mit `--containers-rollout=none` für den Jobs-Worker. Die Reihenfolge ist wichtig: erst Jobs, dann App (Workflow-Bindings brauchen das Ziel-Script).
- Produktions-URL: `https://notebooklm.fancy-cherry-09d8.workers.dev` (= `NEXT_PUBLIC_APP_URL` in `.env.production`, Google-OAuth-Redirect-URI).

## Env im Code lesen

- Immer `import { env } from "cloudflare:workers"`, nie `process.env` im Laufzeit-Code (nur `NEXT_PUBLIC_*`, die vinext inlined). In Funktionen oder Lazy-Gettern lesen, nicht beim Laden des Moduls (`getGemini()`, `chatModels()`).
- Modell-IDs und andere nicht geheime Konfiguration sind `vars` in der Worker-Konfiguration, pro Worker (eine Variable, die beide Worker brauchen, kommt mit identischem Wert in beide Dateien: Die generierten Typen sind Literal-Typen und werden zu einem `Cloudflare.Env` zusammengeführt). Keine Defaults im Code.
- Typen: nach jeder Konfigurationsänderung `pnpm cf-typegen`. Es schreibt `worker-configuration.d.ts` (App, enthält Runtime-Typen und die Workflow-Payload-Typen der Jobs) und `workers/jobs/worker-configuration.d.ts` (`JobsEnv`, keine Runtime-Typen). Beide werden in das globale `Cloudflare.Env` gemergt, sodass geteilter `lib/`-Code die Vereinigung beider Worker sieht; Workflow-Klassen verwenden `WorkflowEntrypoint<JobsEnv, …>` für den exakten Typ.
- Die Workers-Runtime-Typen lassen `Response.json()` `unknown` zurückgeben. Server: `readJsonBody()` + Feldprüfungen (`lib/api/body.ts`). Client: `readJson<T>()` / `readError()` (`lib/api/client.ts`).
- `next` ist nicht installiert; die `next/*`-Typen kommen aus `vinext/types` (tsconfig `types`).

## Secrets

Lokale Secrets liegen in `.env.local` (Inhalt nie lesen; Prozesse dürfen sie laden, generiert aus 1Password via `pnpm env:pull`). Wrangler/Vite lesen sie auch für die lokalen Worker; `vite build` kopiert die Werte in die per gitignore ausgeschlossene `dist/*/.dev.vars` für `pnpm preview` – `dist/` nie committen. Produktions-Secrets sind Worker-Secrets (`secrets.required` in jeder Konfiguration listet sie auf).

- Der PreToolUse-Hook `.claude/hooks/secrets-guard.mjs` blockiert jeden Tool-Aufruf, dessen Ziel eine Secret-Datei ist, bei Bash und PowerShell jeden Befehl, der ihren Namen oder ein passendes Glob (`.env.*`, `.env.loc*`) enthält (außer `--env-file=`). Texte, die den Namen nur erwähnen, per Edit/Write oder in einem gequoteten Heredoc (`<<'EOF'`) schreiben; ungequotete Heredocs führen `$(…)` aus und zählen als Befehl.
- Secrets nie im Client-Code, nie hartcodiert (auch nicht als Fallback), nie geloggt oder zurückgegeben. Ein Secret nie `NEXT_PUBLIC_…` nennen.
- `DATABASE_URL` / `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` müssen eine direkte Postgres-Verbindung sein, nie ein Transaction-Pooler: Hyperdrive poolt selbst und verwendet Prepared Statements. Für Neon: „Connection pooling“ aus, Host ohne `-pooler`, `sslmode=require`; die Hyperdrive-Konfiguration ist „public“ (kein Workers VPC / Access). Produktions-DB-Zugangsdaten liegen nur in der Hyperdrive-Konfiguration, nicht als Worker-Secrets.

## Neue Variable

| Art des Werts                                  | Wo                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Öffentlich, im Browser benötigt                | `NEXT_PUBLIC_…` in `.env.production` und `.env.development` (beide committet)    |
| Nicht geheime Konfiguration (Modell-ID, Limit) | `vars` in der/den Worker-Konfiguration(en), dann `pnpm cf-typegen`               |
| Secret (Key, Token, Passwort, Connection-Str.) | `.env.template` als `NAME=op://Development/NotebookLM/NAME` + `secrets.required` |
| Cloudflare-Ressource (R2, Workflow, …)         | Binding in der Worker-Konfiguration, dann `pnpm cf-typegen`                      |

Bei einem Secret dem Nutzer sagen:

> Bitte lege das Feld `NAME` in 1Password unter `Development → NotebookLM` an, führe `pnpm env:pull` aus und für Produktion `pnpm cf:secrets` (den Namen vorher in `scripts/cf.mjs` ergänzen).

Auf Bestätigung warten, bevor Code getestet wird, der den Wert braucht.

## pnpm

- Build-Scripts werden in `pnpm-workspace.yaml` → `allowBuilds` gesteuert. Eine neue Abhängigkeit mit Postinstall-Script bekommt dort einen Platzhalter; solange er nicht auf `true`/`false` gesetzt ist, schlägt **jedes** `pnpm <script>` mit `ERR_PNPM_IGNORED_BUILDS` fehl. Reine JS-SDKs → `false`. `workerd` muss `true` bleiben.
- `kysely` ist per `overrides` auf `0.28.17` gepinnt (better-auth importiert Exports, die in 0.29.x fehlen). Den Pin nicht entfernen, ohne den Build zu testen.
- Die Supply-Chain-Policy von pnpm 12 lehnt Versionen ab, die jünger als 7 Tage sind (auch transitive). Beim Aktualisieren die neueste Version wählen, die älter als 7 Tage ist.

## Versionsgrenzen

- `typescript` bleibt unter 6.1: `typescript-eslint` (über `eslint-config-next`) unterstützt nur `<6.1.0`.
- `eslint` bleibt auf 9: `eslint-plugin-react` (über `eslint-config-next`) unterstützt nur `^9.7`.
- `@types/node` folgt der Node-Major-Version, die lokal und im Container-Image verwendet wird (lokal 22, Container `node:24-slim`).
- vinext zielt auf Vite 8 (Rolldown/Oxc); keine alte `esbuild`-/`rollupOptions`-Konfiguration hinzufügen.
