import type { Content } from "@google/genai"
import { and, asc, cosineDistance, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { messages, sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { embedQuery } from "@/lib/embeddings"
import { chatModels, geminiErrorMessage, getGemini, withFallback } from "@/lib/gemini"
import { readJsonBody, parseSourceIds } from "@/lib/api/body"
import { extractCitations, type RetrievedChunk } from "@/lib/citations"

const TOP_K = 8

const SYSTEM_PROMPT = `Du bist der KI-Assistent eines Notebooks. Beantworte die Frage des Nutzers ausschließlich anhand der bereitgestellten, nummerierten Quellen-Auszüge.
- Belege jede Aussage direkt dahinter mit der Nummer des Auszugs in eckigen Klammern, z. B. [2]. Mehrere Belege schreibst du als [1][3].
- Verwende nur Nummern, die in den Auszügen vorkommen, und erfinde keine.
- Wenn die Antwort nicht aus den Auszügen hervorgeht, sage das offen und erfinde nichts.
- Antworte auf Deutsch, klar und prägnant.`

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  const db = getDb()

  const body = await readJsonBody(req)
  const message = typeof body.message === "string" ? body.message : ""
  if (!message.trim()) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 })

  const selectedIds = parseSourceIds(body.sourceIds)

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
