---
paths:
  - "app/api/**"
  - "app/(app)/actions.ts"
---

# API Route Handlers & Server Actions

Alles, was Notebook-Inhalte betrifft (Quellen, Chat, Studio, discover, auto-title), läuft über Route Handler unter `app/api/notebooks/[notebookId]/`. Server Actions (`app/(app)/actions.ts`) gibt es nur für Notebook-CRUD (`createNotebook`, `renameNotebook`, `deleteNotebook`) – keine neuen für etwas, das streamt, pollt oder einen Job startet.

Referenz: `app/api/notebooks/[notebookId]/audio/route.ts` (Liste + Job erstellen), `chat/route.ts` (Streaming).

## Auth & Ownership

- `proxy.ts` prüft nur, dass ein Session-Cookie existiert, und leitet auf `/login` um – das ist keine Auth-Prüfung. Jeder Handler prüft selbst:
  - `getSessionUser()` (`lib/auth/session.ts`) → `401 { error: "Nicht angemeldet" }`
  - `getNotebookForUser(notebookId, user.id)` (`lib/notebooks.ts`, validiert auch die UUID) → `404 { error: "Notebook nicht gefunden" }`
- `authorizeNotebook(notebookId)` (`lib/auth/authorizeNotebook.ts`) verwenden: liefert `{ error }` (fertige 401/404-Response) oder `{ user, notebook }`. Danach `const db = getDb()`.
- Kind-Ressourcen: `where(and(eq(x.id, id), eq(x.notebookId, notebookId)))`. Kind-IDs vorher mit `isUuid()` (`lib/uuid.ts`, ohne Server-Abhängigkeiten) validieren, sonst landet eine ungültige ID als Postgres-Fehler / 500.
- `params` ist ein Promise: `type RouteContext = { params: Promise<{ notebookId: string }> }` → `const { notebookId } = await params`.

## Responses

- Fehler: `NextResponse.json({ error: "<deutscher Text>" }, { status })`. 400 ungültige Eingabe, 401, 404, 422 Extraktion fehlgeschlagen, 500. Bei 500 nie rohe Error-Objekte durchreichen, die Env-Werte oder Connection-Strings enthalten könnten.
- Job erstellt: `202` mit der neuen Zeile (siehe `jobs-worker.md`).
- Datumswerte werden server-seitig mit `.toISOString()` serialisiert; Client-Typen verwenden `string`.
- Kein Zod im Projekt: Bodies mit `readJsonBody(req)` lesen und jedes Feld manuell validieren (`optionalString`, `parseSourceIds` aus `lib/api/body.ts`, `typeof`), Enum-Werte über die Lookup-Helfer (`getAudioFormat`, `getReportType`, `getVideoFormat`) abbilden – unbekannte Werte fallen auf den Default zurück, sie werden nie ungeprüft in die DB geschrieben.
- Jedes Freitextfeld hat eine maximale Länge: `lengthError([[body.x, MAX_LENGTH.y], …])` → 400. Neue Felder bekommen einen Eintrag in `MAX_LENGTH`.
- Optionales `sourceIds`: fehlend (`null`) bedeutet „alle bereiten Quellen“, ein leeres Array bedeutet „keine ausgewählt“ → 400. `selectedIds ? inArray(...) : undefined` innerhalb von `and(...)` verwenden (drizzle macht aus `inArray(col, [])` ein `false`). `parseSourceIds` verwirft alles, was keine UUID ist.

## Quotas

Die Gratis-Tarife von Gemini und Tavily werden von allen Besuchern geteilt. Jede Route, die einen KI-Dienst aufruft, ist pro Nutzer begrenzt (`lib/quota.ts`), nach der Ownership-Prüfung und nach der Eingabevalidierung:

- `consumeQuota(user.id, kind)` für jeden KI-Aufruf (`chat`, `discover`, `studio` für Berichte/Audio/Video, `source` für neue Quellen, `assist` für Hilfsaufrufe wie `auto-title`, `report-suggestions` und das Emoji in `renameNotebook`): Burst-Limit über das `USER_RATE_LIMITER`-Binding plus ein rollierendes 24-Stunden-Limit pro Nutzer (`DAILY_LIMITS`) und für die ganze Demo (`GLOBAL_DAILY_LIMITS`, knapp unter den Anbieter-Kontingenten), gezählt in `usage_events`. Zählen und Buchen laufen in einer Transaktion mit `pg_advisory_xact_lock` pro Art, sonst kämen gleichzeitige Anfragen beide unter dem Limit durch. Liefert eine deutsche Meldung → 429.
- `checkRateLimit(user.id)` allein nur für Schreibzugriffe ohne KI: `createNotebook` (dazu höchstens `MAX_NOTEBOOKS_PER_USER` aus `lib/demoConfig.ts`, sonst Redirect auf `/?hinweis=…`). Auch günstige KI-Aufrufe brauchen `consumeQuota`, weil das Burst-Limit allein ein Skript nicht am Leeren des Tageskontingents hindert.
- Quelleninhalte gehen nur über `wrapSources()` in einen Prompt, und der System-Prompt enthält `SOURCES_ARE_DATA` (`lib/prompts.ts`). Das gilt auch für Suchtreffer und Auszüge in Hilfsaufrufen.
- Die Anmeldung ist pro IP im Better-Auth-`hooks.before` begrenzt (`auth.ts`, `AUTH_RATE_LIMITER`). Derselbe Hook lehnt jede Registrierung per HTTP mit 403 ab (siehe `auth.md`). Server-seitige Aufrufe (`auth.api.*` ohne `ctx.request`) überspringen den Hook.

## Runtime

- Routen laufen über vinext auf Cloudflare Workers. `runtime`-/`maxDuration`-Exporte haben dort keine Wirkung und werden nicht verwendet. Synchrone LLM-Aufrufe (`chat`, `discover`, `report-suggestions`, `auto-title`) haben kein Wall-Clock-Limit, solange der Client verbunden ist; alles andere, was länger als ein paar Sekunden dauert, ist ein Workflow (`jobs-worker.md`).

## Chat (RAG, Streaming)

- NDJSON-Stream (`application/x-ndjson; charset=utf-8`, `Cache-Control: no-store`) mit den Events `{type:"text"}`, `{type:"done", messageId, citations}`, `{type:"error"}`; der Stream wird in `finally` geschlossen. Der Client-Parser in `NotebookView.tsx` hängt genau von diesem Format ab.
- Retrieval: Frage einbetten (`embedQuery`) → `cosineDistance` Top-8 auf `source_chunks`, gejoint mit `sources` mit `status = "ready"`. Exakte Suche, kein Vektorindex (siehe `datenbank.md`). Retrieval und Verlauf laufen, bevor der Stream geöffnet wird; ihre Fehler liefern JSON (503 mit `geminiErrorMessage`), und der Client prüft `res.ok`, bevor er NDJSON liest.
- Nur die letzten `HISTORY_MESSAGES` Nachrichten gehen in den Prompt. Der Client kann abbrechen (Stop-Button); `cancel()` des Streams bricht die Gemini-Anfrage ab, eine abgebrochene Antwort wird nicht gespeichert.
- Die Nutzernachricht wird nur zusammen mit der fertigen Antwort gespeichert (zwei getrennte Inserts, damit `created_at` die Reihenfolge behält). Ein fehlgeschlagener Versuch darf nichts im Verlauf hinterlassen, sonst fügt jeder Retry eine weitere unbeantwortete Frage hinzu.
- Modell-Fallback nur beim Öffnen des Streams (`withFallback(chatModels(), openStream)`), nie mitten im Stream: Der Client bekäme doppelten Text. Das `error`-Event trägt `geminiErrorMessage(err)`, nie den rohen `ApiError`.
- Gemini hat keine nativen Citations für eigene Dokumente: Chunks kommen nummeriert als `[n] Titel\nText` (n = Array-Index + 1) in den letzten User-Turn, der System-Prompt verlangt `[n]` hinter jeder Aussage. `extractCitations` liest die Marker aus dem fertigen Text und ordnet sie zurück auf `retrieved[n - 1]` – das Chunk-Array zwischen Prompt-Aufbau und Citation-Zuordnung nicht umsortieren.
- `MessageCitation.marker` ist dieses `n`. Die Marker bleiben im gespeicherten Text; `components/CitedMarkdown` rendert sie als Inline-Chips, nummeriert nach erstem Auftreten, und verknüpft sie über `marker`. History-Rollen: `assistant` → `model`.

## Web-Tools

`discover` sucht mit Tavily (`lib/tavily.ts`: `basic` = 1 Credit für quick, `advanced` = 2 Credits für deep; Gratis-Tarif 1.000 Credits/Monat, keine Karte). Das Google-Search-Grounding von Gemini ist nicht nutzbar: Sein Free-Tier-Kontingent ist 0 (429 beim ersten Aufruf). Ein zweiter `generateText`-Aufruf wählt bis zu 8 Treffer aus und schreibt deutsche Beschreibungen; nur URLs, die in den Tavily-Treffern vorkommen, werden akzeptiert, ohne brauchbares JSON werden Tavily-Reihenfolge und -Auszüge zurückgegeben. Tavily 432/433 (Credits aufgebraucht) → 503 mit deutscher Meldung, nie der rohe Fehler. Der Prompt muss weiter „nur ein JSON-Array“ verlangen. `report-suggestions` ist ein einfacher `generateText`-Aufruf ohne Webzugriff.
