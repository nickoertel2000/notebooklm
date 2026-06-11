import Anthropic from "@anthropic-ai/sdk"
import { and, asc, cosineDistance, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { messages, MessageCitation, sourceChunks, sources } from "@/db/schema"
import { CHAT_MODEL, getAnthropic } from "@/lib/anthropic"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import { embedQuery } from "@/lib/voyage"

export const runtime = "nodejs"
export const maxDuration = 60

const TOP_K = 8

const SYSTEM_PROMPT = `Du bist der KI-Assistent eines Notebooks. Beantworte die Frage des Nutzers ausschließlich anhand der bereitgestellten Quellen-Dokumente.
- Stütze jede Aussage auf die Quellen und zitiere die genutzten Stellen.
- Wenn die Antwort nicht aus den Quellen hervorgeht, sage das offen und erfinde nichts.
- Antworte auf Deutsch, klar und prägnant.`

type RetrievedChunk = {
  chunkId: string
  sourceId: string
  content: string
  sourceTitle: string
  page: number | null
  charStart: number | null
  charEnd: number | null
}

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 })

  const { message, sourceIds } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 })

  // User-Nachricht persistieren.
  await db.insert(messages).values({ notebookId, role: "user", content: message })

  // Optional auf die vom Nutzer ausgewählten Quellen einschränken.
  const selectedIds: string[] | null = Array.isArray(sourceIds) ? sourceIds.filter((id) => typeof id === "string") : null

  // Frage einbetten + notebook-gefilterte Similarity-Suche (nur fertige Quellen).
  const queryVector = await embedQuery(message)
  const distance = cosineDistance(sourceChunks.embedding, queryVector)
  const retrieved: RetrievedChunk[] = await db
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
    .where(
      and(
        eq(sourceChunks.notebookId, notebookId),
        eq(sources.status, "ready"),
        selectedIds && selectedIds.length > 0 ? inArray(sourceChunks.sourceId, selectedIds) : undefined
      )
    )
    .orderBy(distance)
    .limit(TOP_K)

  // Bisherigen Verlauf laden (ohne die gerade eingefügte Frage).
  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.notebookId, notebookId))
    .orderBy(asc(messages.createdAt))
  const prior = history.slice(0, -1)

  // Letzter User-Turn: je Chunk ein document-Block mit aktivierten Citations.
  const documents: Anthropic.DocumentBlockParam[] = retrieved.map((c) => ({
    type: "document",
    source: { type: "content", content: [{ type: "text", text: c.content }] },
    title: c.sourceTitle,
    citations: { enabled: true }
  }))

  const apiMessages: Anthropic.MessageParam[] = [
    ...prior.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: [...documents, { type: "text", text: message }] }
  ]

  const stream = getAnthropic().messages.stream({
    model: CHAT_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: apiMessages
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      let fullText = ""

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text
            send({ type: "text", text: event.delta.text })
          }
        }

        const finalMessage = await stream.finalMessage()
        const citations = extractCitations(finalMessage, retrieved)

        const [row] = await db
          .insert(messages)
          .values({ notebookId, role: "assistant", content: fullText, citations })
          .returning({ id: messages.id })

        send({ type: "done", messageId: row.id, citations })
      } catch (err) {
        console.error("Chat-Stream-Fehler:", err)
        send({ type: "error", error: String(err) })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
  })
}

// Native Claude-Zitate (content_block_location) auf unsere Chunks mappen.
function extractCitations(message: Anthropic.Message, retrieved: RetrievedChunk[]): MessageCitation[] {
  const byChunkId = new Map<string, MessageCitation>()

  for (const block of message.content) {
    if (block.type !== "text" || !block.citations) continue
    for (const citation of block.citations) {
      if (citation.type !== "content_block_location") continue
      const chunk = retrieved[citation.document_index]
      if (!chunk || byChunkId.has(chunk.chunkId)) continue
      byChunkId.set(chunk.chunkId, {
        sourceId: chunk.sourceId,
        chunkId: chunk.chunkId,
        snippet: citation.cited_text,
        page: chunk.page,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd
      })
    }
  }

  return [...byChunkId.values()]
}
