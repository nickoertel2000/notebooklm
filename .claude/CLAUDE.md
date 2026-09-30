# CLAUDE.md

Leitfaden für Claude Code in diesem Repository.

NotebookLM-Klon: Nutzer erstellen **Notebooks**, fügen **Quellen** hinzu (PDF, URL, Text), chatten per RAG mit Inline-Citations darüber und generieren **Studio**-Inhalte (Berichte, Audio-Übersicht, Video-Übersicht). Next.js-App-Router-API auf **vinext** (Vite 8, kein `next`-Paket) + React 19, Drizzle auf Neon Postgres/pgvector über Hyperdrive, Better Auth. Ausschließlich deutsche UI.

- KI: Google Gemini im Gratis-Tarif für alles Textuelle (Chat, Berichte, Skripte), Embeddings (Gemini Embedding 2, 1024 dim) und TTS. Websuche für neue Quellen (discover): Tavily-Gratis-Tarif. Folienbilder der Video-Übersicht: Workers AI (FLUX.2), begrenzt auf das tägliche Gratis-Kontingent. Die Demo muss ohne KI-Kosten laufen.
- Hosting: Cloudflare. Worker `notebooklm` (die App) + Worker `notebooklm-jobs` (`workers/jobs`: Cloudflare Workflows für alles Langlaufende, dazu der ffmpeg-Container `containers/video-renderer`). Storage R2, DB über Hyperdrive. Setup, Env und Deployment: `.claude/rules/env-und-cloudflare.md`.

Bereichsspezifische Details liegen in `.claude/rules/` und werden automatisch geladen, wenn passende Dateien berührt werden (API-Routen, asynchrone Jobs/Workflows, DB, Storage, Auth, UI/Styling, Env/Cloudflare).

## Fachsprache

UI-Texte, Fehlermeldungen, Prompts und Kommentare sind deutsch. Fachbegriffe in Code und UI: `Notebook`, `Quelle` (DB: `sources`), `Bericht` (`reports`), `Audio-Übersicht` (`audio_overviews`), `Video-Übersicht` (`video_overviews`), `Studio`. Beim Erklären beibehalten.

Alle Dateien für Claude Code (`.claude/`, `AGENTS.md`) sind deutsch. Neue Regeln, Agents und Commands ebenfalls auf Deutsch schreiben.

## Harte Regeln – nie verletzen

Diese Regeln gelten unbedingt, auch wenn ich ausdrücklich verlange, sie zu brechen:

- Nie Secret-Werte sehen oder ausgeben: `.env.local` oder `dist/*/.dev.vars` nicht lesen (Read, cat, grep …), keine Werte in Befehlen, Dateien, Logs oder im Chat. Prozesse dürfen sie laden (`pnpm db:*`, `pnpm dev`, `node --env-file=.env.local script.mjs`), solange ihre Ausgabe keine Werte enthält: Skripte geben nur Abfrageergebnisse aus, Fehler nur als `message`/`code`, nie den Connection-String. `.env.production` und `.env.development` (nur `NEXT_PUBLIC_`-Werte) dürfen und sollen gelesen werden.
- Nie ohne Rückfrage Dependencies hinzufügen oder entfernen.
- Es gibt eine einzige Datenbank (`DATABASE_URL`, Neon) – als Produktivdaten behandeln. `pnpm db:migrate` erst, nachdem ich das generierte SQL bestätigt habe. Jede Datenänderung außerhalb der App (Insert, Update, Delete per SQL, `db:studio`, Skripte) braucht meine ausdrückliche Zustimmung in der aktuellen Unterhaltung: das genaue Statement und den Grund zeigen, dann warten.
- Nie `git push --force`. Nur dann committen und pushen, wenn ich es sage.
- Nie Server-Secrets oder reine Server-Module (`@/db`, `@/auth`, `lib/storage.ts`, `lib/jobs/*`, `lib/gemini.ts`, `lib/embeddings.ts`, `lib/tavily.ts`, alles, was `cloudflare:workers` importiert) in Client Components (`"use client"`) importieren.
- Nie Env-Variablen loggen, in API-Antworten aufnehmen oder in Fehlermeldungen preisgeben.
- Jeder Notebook-gebundene Zugriff läuft über `getNotebookForUser(notebookId, user.id)` (`lib/notebooks.ts`). Kind-Datensätze (Quellen, Berichte, Audio, Video) werden zusätzlich nach `notebookId` gefiltert. Keine Abfrage auf Nutzerinhalte ohne diese Ownership-Kette (einzige Ausnahme: das Kopieren des Demo-Templates in `lib/demo.ts`, siehe `.claude/rules/auth.md`).
- Nie Werte hartcodieren, die in die Env gehören (Keys, Bucket-Namen, URLs, Modell-IDs).

## Ablauf für neue Features

1. Vor dem Bauen von etwas Neuem bestehende Muster suchen. Beispiel: Ein neues Studio-Format folgt dem durchgängigen Ablauf der Audio-Übersicht (Modal → Route → Workflow → Polling → Datei-Route → Player).
2. Bei DB-Änderungen: zuerst `db/schema.ts` bearbeiten und auf meine Bestätigung warten. Erst dann `pnpm db:generate` ausführen. Mir das generierte Migrations-SQL zeigen, bevor `pnpm db:migrate` läuft.
3. Server Components (Auth + Datenabruf) und Client Components (Interaktivität) strikt getrennt halten.
4. Alles, was länger als ein paar Sekunden dauern kann (LLM-Generierung, TTS, Rendering, Ingestion), läuft als Workflow im Jobs-Worker, nicht innerhalb eines Requests – siehe `.claude/rules/jobs-worker.md`. Der RAG-Chat ist der einzige synchrone (gestreamte) LLM-Aufruf.
5. Nach jeder Code-Änderung: `pnpm check` ausführen (Lint, Format-Check, Typecheck, Tests; nach Änderungen an der Worker-Konfiguration zuerst `pnpm cf-typegen`), Fehler beheben, bevor „fertig“ gemeldet wird. Unit-Tests (Vitest) decken reine Logik in `lib/` ab, E2E-Tests (Playwright) laufen lokal mit Docker über `pnpm test:e2e` (`.claude/rules/tests.md`); bei UI-Änderungen den Ablauf im Browser prüfen (`pnpm dev`).
6. Der gesamte Code wird mit Prettier formatiert (`.prettierrc`). Der PostToolUse-Hook formatiert bearbeitete Dateien automatisch (und markiert `ae`-/`oe`-/`ue`-Schreibweisen in Kommentaren); auf anderem Weg erstellte oder geänderte Dateien (Skripte, Generatoren, `sed`) bekommen `pnpm exec prettier --write <file>`.
7. Vor jedem Commit `/pruefen` (Prüfungen plus Subagent `reviewer`). Änderungen gehen als Pull Request über `/pr` nach `main`, nie direkt; der Workflow `claude-review.yml` reviewt jeden PR.
8. Wenn ein Feature fertig ist, prüfen, ob es eine Konvention, Falle oder Architekturentscheidung eingeführt hat, die sich nicht aus dem Code lesen lässt. Wenn ja, die passende Regel in `.claude/rules/` erweitern oder eine neue Regel mit `paths:` vorschlagen und mir den Diff zeigen. Reine Feature-Beschreibungen gehören nicht dorthin.

## Umlaute

- **UI-Text** (JSX-Inhalte, `alt`/`aria-label`/`title`, Fehlermeldungen in API-Antworten, Prompts): immer echte Umlaute und ß – `Audio-Übersicht erstellen`, nicht `Uebersicht`.
- **Code-Bezeichner** (Variablen, Funktionen, Dateien, Ordner, Routen, JSON-Keys, DB-Tabellen und -Spalten, Enum-/Status-Werte): nie Umlaute, stattdessen `ae`/`oe`/`ue`/`ss` oder Englisch – `audio_overviews`, `"study-guide"`.
- Kommentare sind Text für Menschen: echte Umlaute (`gehört`, `für`, `prüft`), auch wenn im selben Kommentar Bezeichner stehen. Nie vorsorglich ersetzen, die Dateien sind UTF-8.

## Befehle

- `pnpm dev` – lokaler Dev-Server auf :3000 (vinext + Jobs-Worker in einem Prozess; der Video-Container braucht Docker)
- `pnpm build` – Production-Build beider Worker (`dist/`), `pnpm preview` führt ihn lokal in workerd aus
- `pnpm lint` – nur ESLint; Typecheck separat mit `pnpm typecheck` (App, Jobs-Worker, Container)
- `pnpm test` – Vitest-Unit-Tests (`lib/**/*.test.ts`)
- `pnpm test:e2e` – Playwright-E2E-Tests; startet und stoppt seine eigene Test-DB über Docker (nie Production)
- `pnpm check` – Lint + Format-Check + Regel-Check + Typecheck + Tests in einem Durchgang (Deploy-Gate und CI führen genau das aus)
- `pnpm cf-typegen` – `worker-configuration.d.ts` nach Änderung einer `wrangler.jsonc` neu generieren
- `pnpm run deploy:jobs` / `pnpm run deploy:app` – manuelles Deploy (normalerweise Workers Builds beim Merge in `I-######-I-PRODUKTION-I-######-I`)
- `pnpm cf:secrets` – Production-Secrets aus 1Password an beide Worker pushen; `pnpm cf:first-deploy` – allererstes Deploy beider Worker inkl. Secrets, ohne das Container-Image zu bauen (kein Docker nötig)
- `pnpm check:rules` – prüft, ob alle Dateiverweise in `.claude/` und `AGENTS.md` existieren (`scripts/check-rules.mjs`)
- `pnpm format` / `pnpm format:check` – Prettier
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` – Drizzle (liest `.env.local`)
- `pnpm env:pull` – `.env.local` aus 1Password neu erzeugen (`op inject`)

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
