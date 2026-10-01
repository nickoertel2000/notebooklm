import type { Content } from "@google/genai"
import { and, cosineDistance, desc, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { messages, sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { embedQuery } from "@/lib/embeddings"
import { chatModels, geminiErrorMessage, getGemini, withFallback } from "@/lib/gemini"
import { MAX_LENGTH, parseSourceIds, readJsonBody } from "@/lib/api/body"
import { extractCitations, type RetrievedChunk } from "@/lib/citations"
import { SOURCES_ARE_DATA, wrapSources } from "@/lib/prompts"
import { consumeQuota } from "@/lib/quota"

const TOP_K = 8
// Ältere Nachrichten fallen aus dem Prompt, sonst wächst jede Anfrage mit der Länge des Chats.
const HISTORY_MESSAGES = 20

const SYSTEM_PROMPT = `Du bist der KI-Assistent eines Notebooks. Beantworte die Frage des Nutzers ausschließlich anhand der bereitgestellten, nummerierten Quellen-Auszüge.
- Belege jede Aussage direkt dahinter mit der Nummer des Auszugs in eckigen Klammern, z. B. [2]. Mehrere Belege schreibst du als [1][3].
- Verwende nur Nummern, die in den Auszügen vorkommen, und erfinde keine.
- Wenn die Antwort nicht aus den Auszügen hervorgeht, sage das offen und erfinde nichts.
- Antworte auf Deutsch, klar und prägnant.
${SOURCES_ARE_DATA}`

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  const db = getDb()

  const body = await readJsonBody(req)
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 })
  if (message.length > MAX_LENGTH.message) return NextResponse.json({ error: `Die Frage ist zu lang (höchstens ${MAX_LENGTH.message} Zeichen)` }, { status: 400 })

  const selectedIds = parseSourceIds(body.sourceIds)
  if (selectedIds?.length === 0) return NextResponse.json({ error: "Keine Quelle ausgewählt" }, { status: 400 })

  const quotaError = await consumeQuota(auth.user.id, "chat")
  if (quotaError) return NextResponse.json({ error: quotaError }, { status: 429 })

  let retrieved: RetrievedChunk[]
  let prior: { role: string; content: string }[]
  try {
    const queryVector = await embedQuery(message)
    const distance = cosineDistance(sourceChunks.embedding, queryVector)
    ;[retrieved, prior] = await Promise.all([
      db
        .select({
          chunkId: sourceChunks.id,
          sourceId: sourceChunks.sourceId,
          content: sourceChunks.content,
          sourceTitle: sources.title,
          page: sourceChunks.page,
          charStart: sourceChunks.charStart,
          charEnd: sourceChunks.charEnd
        })
        .from(sourceChunks)
        .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
        .where(and(eq(sourceChunks.notebookId, notebookId), eq(sources.status, "ready"), selectedIds ? inArray(sourceChunks.sourceId, selectedIds) : undefined))
        .orderBy(distance)
        .limit(TOP_K),
      db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.notebookId, notebookId))
        .orderBy(desc(messages.createdAt))
        .limit(HISTORY_MESSAGES)
        .then((rows) => rows.reverse().filter((m) => m.content.trim()))
    ])
  } catch (err) {
    console.error("Chat-Retrieval fehlgeschlagen:", err)
    return NextResponse.json({ error: geminiErrorMessage(err) }, { status: 503 })
  }

  // Die Nummer n im Prompt ist retrieved[n - 1]; extractCitations verlässt sich darauf.
  const excerpts = retrieved.map((c, i) => `[${i + 1}] ${c.sourceTitle}\n${c.content}`).join("\n\n")
  const contents: Content[] = [
    ...prior.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: `Quellen-Auszüge:\n${wrapSources(excerpts || "(keine)")}\n\nFrage: ${message}` }] }
  ]

  // Bricht der Client ab (Stop-Button, Tab zu), wird auch die Generierung bei Gemini beendet.
  const abort = new AbortController()
  const openStream = (model: string) =>
    getGemini().models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 8000, abortSignal: abort.signal }
    })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      let fullText = ""

      try {
        // Das SDK wirft 429/5xx schon beim Öffnen des Streams, also vor dem ersten Text.
        const stream = await withFallback(chatModels(), openStream)

        for await (const chunk of stream) {
          const text = chunk.text
          if (!text) continue
          fullText += text
          send({ type: "text", text })
        }

        const citations = extractCitations(fullText, retrieved)

        // Frage erst mit der fertigen Antwort speichern, sonst sammeln sich nach Fehlern
        // unbeantwortete Fragen im Verlauf. Getrennte Inserts, damit created_at die Reihenfolge hält.
        await db.insert(messages).values({ notebookId, role: "user", content: message })
        const [row] = await db.insert(messages).values({ notebookId, role: "assistant", content: fullText, citations }).returning({ id: messages.id })

        send({ type: "done", messageId: row.id, citations })
      } catch (err) {
        if (abort.signal.aborted) return
        console.error("Chat-Stream-Fehler:", err)
        send({ type: "error", error: geminiErrorMessage(err) })
      } finally {
        if (!abort.signal.aborted) controller.close()
      }
    },
    cancel() {
      abort.abort()
    }
  })

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
  })
}
