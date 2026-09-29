import type { Content } from "@google/genai"
import { and, asc, cosineDistance, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { messages, MessageCitation, sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { embedQuery } from "@/lib/embeddings"
import { chatModel, geminiErrorMessage, getGemini, withFallback } from "@/lib/gemini"
import { readJsonBody, parseSourceIds } from "@/lib/api/body"

const TOP_K = 8
const SNIPPET_LENGTH = 240

const SYSTEM_PROMPT = `Du bist der KI-Assistent eines Notebooks. Beantworte die Frage des Nutzers ausschließlich anhand der bereitgestellten, nummerierten Quellen-Auszüge.
- Belege jede Aussage direkt dahinter mit der Nummer des Auszugs in eckigen Klammern, z. B. [2]. Mehrere Belege schreibst du als [1][3].
- Verwende nur Nummern, die in den Auszügen vorkommen, und erfinde keine.
- Wenn die Antwort nicht aus den Auszügen hervorgeht, sage das offen und erfinde nichts.
- Antworte auf Deutsch, klar und prägnant.`

// [n] oder [n, m] im Antworttext.
const MARKER_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g

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

  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  const db = getDb()

  const body = await readJsonBody(req)
  const message = typeof body.message === "string" ? body.message : ""
  if (!message.trim()) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 })

  // Optional auf die vom Nutzer ausgewählten Quellen einschränken.
  const selectedIds = parseSourceIds(body.sourceIds)

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

  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.notebookId, notebookId))
    .orderBy(asc(messages.createdAt))
  const prior = history.filter((m) => m.content.trim())

  // Die Nummer n im Prompt ist retrieved[n - 1]; extractCitations verlässt sich darauf.
  const excerpts = retrieved.map((c, i) => `[${i + 1}] ${c.sourceTitle}\n${c.content}`).join("\n\n")
  const contents: Content[] = [
    ...prior.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: `Quellen-Auszüge:\n\n${excerpts || "(keine)"}\n\n---\n\nFrage: ${message}` }] }
  ]

  const openStream = (model: string) =>
    getGemini().models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 8000 }
    })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      let fullText = ""

      try {
        // Das SDK wirft 429/5xx schon beim Öffnen des Streams, also vor dem ersten Text.
        const stream = await withFallback(chatModel(), openStream)

        for await (const chunk of stream) {
          const text = chunk.text
          if (!text) continue
          fullText += text
          send({ type: "text", text })
        }

        const citations = extractCitations(fullText, retrieved)

        // Frage erst mit der fertigen Antwort speichern: Nach einem Fehler bliebe
        // sonst eine unbeantwortete Frage im Verlauf, bei jedem neuen Versuch eine weitere.
        // Getrennte Inserts, damit created_at die Reihenfolge eindeutig hält.
        await db.insert(messages).values({ notebookId, role: "user", content: message })
        const [row] = await db.insert(messages).values({ notebookId, role: "assistant", content: fullText, citations }).returning({ id: messages.id })

        send({ type: "done", messageId: row.id, citations })
      } catch (err) {
        console.error("Chat-Stream-Fehler:", err)
        send({ type: "error", error: geminiErrorMessage(err) })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
  })
}

// Marker [n] aus der Antwort auf die abgerufenen Chunks abbilden, in Reihenfolge
// des ersten Auftretens, ein Zitat pro Marker.
function extractCitations(text: string, retrieved: RetrievedChunk[]): MessageCitation[] {
  const byMarker = new Map<number, MessageCitation>()

  for (const match of text.matchAll(MARKER_PATTERN)) {
    for (const part of match[1].split(",")) {
      const marker = Number(part.trim())
      const chunk = retrieved[marker - 1]
      if (!chunk || byMarker.has(marker)) continue
      byMarker.set(marker, {
        marker,
        sourceId: chunk.sourceId,
        chunkId: chunk.chunkId,
        snippet: snippetOf(chunk.content),
        page: chunk.page,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd
      })
    }
  }

  return [...byMarker.values()]
}

function snippetOf(content: string): string {
  const text = content.replace(/\s+/g, " ").trim()
  if (text.length <= SNIPPET_LENGTH) return text
  const cut = text.slice(0, SNIPPET_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")
  return `${lastSpace > SNIPPET_LENGTH / 2 ? cut.slice(0, lastSpace) : cut}…`
}
