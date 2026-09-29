---
paths:
  - "app/api/**"
  - "app/(app)/actions.ts"
---

# API Route Handlers & Server Actions

Everything notebook-content related (sources, chat, Studio, discover, auto-title) goes through Route Handlers under `app/api/notebooks/[notebookId]/`. Server Actions (`app/(app)/actions.ts`) exist only for Notebook CRUD (`createNotebook`, `renameNotebook`, `deleteNotebook`) — don't add new ones for anything that streams, polls or starts a job.

Reference: `app/api/notebooks/[notebookId]/audio/route.ts` (list + create job), `chat/route.ts` (streaming).

## Auth & Ownership

- `proxy.ts` only checks that a session cookie exists and redirects to `/login` — it's not an auth check. Every handler checks itself:
  - `getSessionUser()` (`lib/auth/session.ts`) → `401 { error: "Nicht angemeldet" }`
  - `getNotebookForUser(notebookId, user.id)` (`lib/notebooks.ts`, also validates the UUID) → `404 { error: "Notebook nicht gefunden" }`
- Use `authorizeNotebook(notebookId)` (`lib/auth/authorizeNotebook.ts`): returns `{ error }` (ready 401/404 response) or `{ user, notebook }`. Then `const db = getDb()`.
- Child resources: `where(and(eq(x.id, id), eq(x.notebookId, notebookId)))`. Validate child IDs with `isUuid()` first, otherwise an invalid ID ends up as a Postgres error / 500.
- `params` is a Promise: `type RouteContext = { params: Promise<{ notebookId: string }> }` → `const { notebookId } = await params`.

## Responses

- Errors: `NextResponse.json({ error: "<deutscher Text>" }, { status })`. 400 invalid input, 401, 404, 422 extraction failed, 500. For 500 never pass through raw error objects that could contain env values or connection strings.
- Job created: `202` with the new row (see `jobs-worker.md`).
- Dates are serialized server-side with `.toISOString()`; client types use `string`.
- No Zod in the project: read bodies with `readJsonBody(req)` and validate each field manually (`optionalString`, `parseSourceIds` from `lib/api/body.ts`, `typeof`), map enum values through the lookup helpers (`getAudioFormat`, `getReportType`, `getVideoFormat`) — unknown values fall back, they are never written to the DB unchecked.
- Optional `sourceIds`: empty/missing means "all ready sources" (`sourceIds?.length ? inArray(...) : undefined` inside `and(...)`).

## Runtime

- Routes run on Cloudflare Workers via vinext. `runtime`/`maxDuration` exports have no effect there and are not used. Synchronous LLM calls (`chat`, `discover`, `report-suggestions`, `auto-title`) have no wall-clock limit while the client is connected; everything else longer than a few seconds is a Workflow (`jobs-worker.md`).

## Chat (RAG, streaming)

- NDJSON stream (`application/x-ndjson; charset=utf-8`, `Cache-Control: no-store`) with events `{type:"text"}`, `{type:"done", messageId, citations}`, `{type:"error"}`; the stream is closed in `finally`. The client parser in `NotebookView.tsx` depends on exactly this format.
- Retrieval: embed question (`embedQuery`) → `cosineDistance` top-8 on `source_chunks`, joined to `sources` with `status = "ready"`.
- The user message is persisted only together with the finished answer (two separate inserts, so `created_at` keeps the order). A failed attempt must leave nothing in the history, otherwise every retry adds another unanswered question.
- Model fallback only when opening the stream (`withFallback(chatModel(), openStream)`), never mid-stream: the client would get duplicated text. The `error` event carries `geminiErrorMessage(err)`, never the raw `ApiError`.
- Gemini has no native citations for own documents: chunks go into the last user turn numbered `[n] Titel\nText` (n = array index + 1), the system prompt demands `[n]` after every statement. `extractCitations` reads the markers from the finished text and maps them back to `retrieved[n - 1]` — don't reorder the chunk array between building the prompt and mapping citations.
- `MessageCitation.marker` is that `n`. The markers stay in the stored text; `components/CitedMarkdown` renders them as inline chips numbered by first appearance and links them via `marker`. History roles map `assistant` → `model`.

## Web tools

`discover` searches with Tavily (`lib/tavily.ts`: `basic` = 1 credit for quick, `advanced` = 2 credits for deep; free tier 1,000 credits/month, no card). Gemini's Google Search grounding is not usable: its free-tier quota is 0 (429 on the first call). A second `generateText` call picks up to 8 hits and writes German descriptions; only URLs present in the Tavily hits are accepted, without usable JSON the Tavily order and excerpts are returned. Tavily 432/433 (credits used up) → 503 with a German message, never the raw error. The prompt must keep demanding "nur ein JSON-Array". `report-suggestions` is a plain `generateText` call without web access.
