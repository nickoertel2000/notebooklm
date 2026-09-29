---
paths:
  - "app/api/**"
  - "app/(app)/actions.ts"
---

# API Route Handlers & Server Actions

Everything notebook-content related (sources, chat, Studio, discover, auto-title) goes through Route Handlers under `app/api/notebooks/[notebookId]/`. Server Actions (`app/(app)/actions.ts`) exist only for Notebook CRUD (`createNotebook`, `renameNotebook`, `deleteNotebook`) — don't add new ones for anything that streams, polls or starts a job.

Reference: `app/api/notebooks/[notebookId]/audio/route.ts` (list + create job), `chat/route.ts` (streaming).

## Auth & Ownership

- `middleware.ts` only checks that a session cookie exists and redirects to `/login` — it's not an auth check. Every handler checks itself:
  - `getSessionUser()` (`lib/auth/session.ts`) → `401 { error: "Nicht angemeldet" }`
  - `getNotebookForUser(notebookId, user.id)` (`lib/notebooks.ts`, also validates the UUID) → `404 { error: "Notebook nicht gefunden" }`
- Routes with several methods use a file-local `authorize(notebookId)` returning `{ error } | { user, notebook }`; copy that shape.
- Child resources: `where(and(eq(x.id, id), eq(x.notebookId, notebookId)))`. Validate child IDs with `isUuid()` first, otherwise an invalid ID ends up as a Postgres error / 500.
- `params` is a Promise: `type RouteContext = { params: Promise<{ notebookId: string }> }` → `const { notebookId } = await params`.

## Responses

- Errors: `NextResponse.json({ error: "<deutscher Text>" }, { status })`. 400 invalid input, 401, 404, 422 extraction failed, 500. For 500 never pass through raw error objects that could contain env values or connection strings.
- Job created: `202` with the new row (see `jobs-worker.md`).
- Dates are serialized server-side with `.toISOString()`; client types use `string`.
- No Zod in the project: validate manually (`typeof`, `Array.isArray(...).filter(...)`) and map enum values through the lookup helpers (`getAudioFormat`, `getReportType`, `getVideoFormat`) — unknown values fall back, they are never written to the DB unchecked.
- Optional `sourceIds`: empty/missing means "all ready sources" (`sourceIds?.length ? inArray(...) : undefined` inside `and(...)`).

## Runtime

- `export const runtime = "nodejs"` on every route. `maxDuration` only on synchronous LLM routes (`chat`, `discover` 60, `report-suggestions` 30) — both are Amplify-specific and will change with the Cloudflare migration.

## Chat (RAG, streaming)

- NDJSON stream (`application/x-ndjson; charset=utf-8`, `Cache-Control: no-store`) with events `{type:"text"}`, `{type:"done", messageId, citations}`, `{type:"error"}`; the stream is closed in `finally`. The client parser in `NotebookView.tsx` depends on exactly this format.
- Retrieval: embed question (`embedQuery`) → `cosineDistance` top-8 on `source_chunks`, joined to `sources` with `status = "ready"`.
- Each chunk is passed as a `document` block with `citations: { enabled: true }`; `extractCitations` maps `document_index` back to the array index of the retrieved chunks — don't reorder the chunk array between building the request and mapping citations.

## Web tools

`discover` and `report-suggestions` use the Anthropic `web_search` server tool and parse a JSON array out of the text answer via regex. Prompts must keep demanding "nur ein JSON-Array".
