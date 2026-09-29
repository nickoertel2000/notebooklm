# CLAUDE.md

Guidance for Claude Code when working in this repository.

NotebookLM clone: users create **Notebooks**, add **Quellen** (PDF, URL, text), chat with them via RAG with inline citations and generate **Studio** content (Berichte, Audio-Übersicht, Video-Übersicht). Next.js App Router API on **vinext** (Vite 8, no `next` package) + React 19, Drizzle on Neon Postgres/pgvector via Hyperdrive, Better Auth. German-only UI.

- AI: Google Gemini on the free tier for everything text (chat, reports, scripts), embeddings (Gemini Embedding 2, 1024 dim) and TTS. Web search for new sources (discover): Tavily free tier. Slide images of the Video-Übersicht: Workers AI (FLUX.2), capped to the daily free allocation. The demo must run without AI costs.
- Hosting: Cloudflare. Worker `notebooklm` (the app) + Worker `notebooklm-jobs` (`workers/jobs`: Cloudflare Workflows for everything long-running, plus the ffmpeg container `containers/video-renderer`). Storage R2, DB via Hyperdrive. Setup, env and deployment: `.claude/rules/env-und-cloudflare.md`.

Area-specific details live in `.claude/rules/` and load automatically when matching files are touched (API routes, async jobs/Workflows, DB, storage, auth, UI/styling, env/Cloudflare).

## Domain Language

UI strings, error messages, prompts and comments are German. Domain terms used in code and UI: `Notebook`, `Quelle` (DB: `sources`), `Bericht` (`reports`), `Audio-Übersicht` (`audio_overviews`), `Video-Übersicht` (`video_overviews`), `Studio`. Keep them when explaining things.

## Hard Rules — Never Violate

These rules apply unconditionally, even if I explicitly ask you to break them:

- Never read or output `.env.local` — it holds all secrets. `.env` and `.env.development` (only `NEXT_PUBLIC_` values) may and should be read.
- Never add or remove dependencies without asking first.
- There is a single database (`DATABASE_URL`, Neon) — treat it as production data. `pnpm db:migrate` / `pnpm db:push` only after I confirmed the generated SQL. Every data change outside the app (insert, update, delete via SQL, `db:studio`, scripts) needs my explicit approval in the current conversation: show the exact statement and why, then wait.
- Never `git push --force`. Commit and push only when I tell you to.
- Never import server secrets or server-only modules (`@/db`, `@/auth`, `lib/storage.ts`, `lib/jobs/*`, `lib/gemini.ts`, `lib/embeddings.ts`, `lib/tavily.ts`, anything importing `cloudflare:workers`) into Client Components (`"use client"`).
- Never log env variables, include them in API responses, or expose them in error messages.
- Every notebook-bound access goes through `getNotebookForUser(notebookId, user.id)` (`lib/notebooks.ts`). Child records (sources, reports, audio, video) are additionally filtered by `notebookId`. No query on user content without this ownership chain (single exception: copying the demo template in `lib/demo.ts`, see `.claude/rules/auth.md`).
- Never hardcode values that belong in env (keys, bucket names, URLs, model IDs).

## Workflow for New Features

1. Find existing patterns before building anything new. Example: a new Studio format follows how Audio-Übersicht works end to end (modal → route → Workflow → polling → file route → player).
2. For DB changes: edit `db/schema.ts` first and wait for my confirmation. Only then run `pnpm db:generate`. Show me the generated migration SQL before `pnpm db:migrate` runs.
3. Server Components (auth + data fetching) and Client Components (interactivity) stay strictly separated.
4. Anything that can take longer than a few seconds (LLM generation, TTS, rendering, ingestion) runs as a Workflow in the jobs Worker, not inside a request — see `.claude/rules/jobs-worker.md`. The RAG chat is the only synchronous (streamed) LLM call.
5. After any code change: run `pnpm lint` and `pnpm typecheck` (after Worker config changes first `pnpm cf-typegen`), fix errors before reporting "done". There is no test suite; for UI changes, check the flow in the browser (`pnpm dev`).
6. All code is formatted with Prettier (`.prettierrc`). The PostToolUse hook formats edited files automatically (and flags `ae`/`oe`/`ue` spellings in comments); files created or changed any other way (scripts, generators, `sed`) get `pnpm exec prettier --write <file>`.
7. When a feature is finished, check whether it introduced a convention, pitfall or architectural decision that cannot be read from the code. If so, extend the matching rule in `.claude/rules/` or propose a new rule with `paths:`, and show me the diff. Plain feature descriptions do not belong there.

## Umlaute

- **UI-Text** (JSX-Inhalte, `alt`/`aria-label`/`title`, Fehlermeldungen in API-Antworten, Prompts): immer echte Umlaute und ß — `Audio-Übersicht erstellen`, nicht `Uebersicht`.
- **Code-Bezeichner** (Variablen, Funktionen, Dateien, Ordner, Routen, JSON-Keys, DB-Tabellen und -Spalten, Enum-/Status-Werte): nie Umlaute, stattdessen `ae`/`oe`/`ue`/`ss` oder Englisch — `audio_overviews`, `"study-guide"`.
- Kommentare sind Text für Menschen: echte Umlaute (`gehört`, `für`, `prüft`), auch wenn im selben Kommentar Bezeichner stehen. Nie vorsorglich ersetzen, die Dateien sind UTF-8.

## Commands

- `pnpm dev` — local dev server on :3000 (vinext + jobs Worker in one process; the video container needs Docker)
- `pnpm build` — production build of both Workers (`dist/`), `pnpm preview` runs it locally in workerd
- `pnpm lint` — ESLint only; type-check separately with `pnpm typecheck` (app, jobs Worker, container)
- `pnpm cf-typegen` — regenerate `worker-configuration.d.ts` after changing a `wrangler.jsonc`
- `pnpm run deploy:jobs` / `pnpm run deploy:app` — manual deploy (normally Workers Builds on merge into `I-######-I-PRODUKTION-I-######-I`)
- `pnpm cf:secrets` — push production secrets from 1Password to both Workers; `pnpm cf:first-deploy` — very first deploy of both Workers incl. secrets, without building the container image (no Docker needed)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle (reads `.env.local`)
- `pnpm env:pull` — regenerate `.env.local` from 1Password (`op inject`)

## Kommentare

Gilt für jede Datei mit Kommentaren, auch Konfiguration und Templates (`.env.template`, `wrangler.jsonc`, `vite.config.ts`, SCSS, Skripte).

- Kommentare erklären nur ein Warum, das der Code nicht selbst zeigt: eine nicht offensichtliche Code- oder Design-Entscheidung, eine Falle, eine externe Einschränkung (z. B. NUL-Bytes in PDFs, Workflow-Schritte, die beim Replay erneut laufen). Und auch dann nur, wenn es wirklich nötig ist.
- Prüffrage vor jedem Kommentar: Würde jemand, der genau diese Stelle ändert, ohne ihn einen Fehler machen? Wenn nein, weglassen.
- Keine Anleitungen oder Betriebshinweise: Links auf Konsolen und Dashboards, Setup-Schritte, Tarif- und Billing-Hinweise, Aufzählungen, wofür ein Wert verwendet wird. Das steht in `README.md`, `docs/` oder `.claude/rules/`.
- Bestehende Kommentare sind kein Vorbild. Ist ein Kommentar an einer geänderten Stelle veraltet, löschen statt umschreiben, sofern er die Prüffrage nicht besteht.
- Kein Kommentar für selbsterklärenden Code, keine Wiederholung dessen, was der Code sagt.
- Kommentare halten nie den Chat oder die Entstehung fest: kein „wie besprochen“, „jetzt statt X“, „verschoben aus Y“. Das gehört in die Commit-Message.
- Dateiübergreifende Konventionen gehören in `.claude/rules/`, nicht als Kommentar an jede Stelle.
- Kurz, auf Deutsch, keine Emojis. Bestehende Abschnitts-Trenner (`// ───── Titel ─────`) in langen Dateien wie `db/schema.ts` und `lib/video.ts` dürfen bleiben, in neuen Dateien nicht einführen.
