import { and, asc, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { reports, sourceChunks, sources } from "@/db/schema"
import { buildReportSystemPrompt, deriveReportTitle, getReportType } from "@/lib/reports"
import { getAnthropic, REPORT_MODEL } from "@/lib/anthropic"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"
export const maxDuration = 120

// Obergrenze für den Quellen-Kontext (~150k Zeichen ≈ ~45k Tokens).
const MAX_CONTEXT_CHARS = 150_000

// Berichte, die länger als das hier in 'processing' hängen, gelten als
// abgebrochen (z. B. Verbindung beim Generieren verloren) und werden beim
// Auflisten auf 'failed' gesetzt — sonst pollt das Studio-Panel endlos.
const STALE_PROCESSING_MS = 5 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Persistierte Berichte des Notebooks auflisten (ohne content) – fürs Studio-Panel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  // Hängengebliebene 'processing'-Berichte aufräumen, bevor wir auflisten.
  await db
    .update(reports)
    .set({ status: "failed", error: "Zeitüberschreitung bei der Erstellung" })
    .where(
      and(
        eq(reports.notebookId, notebookId),
        eq(reports.status, "processing"),
        lt(reports.createdAt, new Date(Date.now() - STALE_PROCESSING_MS))
      )
    )

  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      title: reports.title,
      sourceCount: reports.sourceCount,
      status: reports.status,
      createdAt: reports.createdAt
    })
    .from(reports)
    .where(eq(reports.notebookId, notebookId))
    .orderBy(desc(reports.createdAt))

  return NextResponse.json({ reports: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) })
}

// Bericht erstellen: Zeile als 'processing' anlegen, synchron generieren,
// persistieren und das fertige Element zurückgeben.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const { type, sourceIds, instruction: customInstruction, title: customTitle, language } = await req.json()

  // Entweder ein bekannter Typ ODER eine freie Anweisung (Eigener Bericht /
  // KI-Formatvorschlag).
  const reportType = getReportType(type)
  const freeInstruction = typeof customInstruction === "string" ? customInstruction.trim() : ""
  if (!reportType && !freeInstruction) {
    return NextResponse.json({ error: "Unbekannter Bericht-Typ" }, { status: 400 })
  }

  const instruction = reportType ? reportType.instruction : freeInstruction
  const reportTypeId = reportType ? reportType.id : "custom"
  const reportLabel = reportType
    ? reportType.label
    : typeof customTitle === "string" && customTitle.trim()
      ? customTitle.trim()
      : "Eigener Bericht"

  const selectedIds: string[] | null = Array.isArray(sourceIds) ? sourceIds.filter((id) => typeof id === "string") : null

  // Alle Chunks der (ausgewählten) fertigen Quellen, geordnet nach Quelle und Position.
  const rows = await db
    .select({
      sourceId: sourceChunks.sourceId,
      sourceTitle: sources.title,
      idx: sourceChunks.idx,
      content: sourceChunks.content
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
    .orderBy(asc(sources.title), asc(sourceChunks.idx))

  if (rows.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = new Set(rows.map((r) => r.sourceId)).size

  // Bericht zunächst als 'processing' persistieren.
  const [created] = await db
    .insert(reports)
    .values({ notebookId, type: reportTypeId, title: reportLabel, sourceCount, status: "processing" })
    .returning({ id: reports.id, createdAt: reports.createdAt })

  // Kontext nach Quelle gruppiert aufbauen, bis das Zeichenbudget erreicht ist.
  let context = ""
  let currentSource = ""
  for (const row of rows) {
    if (row.sourceTitle !== currentSource) {
      currentSource = row.sourceTitle
      context += `\n\n=== Quelle: ${row.sourceTitle} ===\n`
    }
    context += row.content + "\n"
    if (context.length >= MAX_CONTEXT_CHARS) break
  }

  const userContent = `Hier sind die Quellen des Notebooks:\n${context.trim()}\n\n---\n\nAufgabe: ${instruction}`

  // Antwort gestreamt (NDJSON): Der erste Byte geht sofort raus, dadurch greift
  // das 30-Sekunden-Timeout des Amplify-SSR-Runtime (Time-to-first-byte) nicht.
  // Die Synthese läuft anschließend beliebig lange weiter. Am Ende wird der
  // fertige Bericht persistiert und als 'done'-Event geschickt.
  const stream = getAnthropic().messages.stream({
    model: REPORT_MODEL,
    max_tokens: 8000,
    system: buildReportSystemPrompt(typeof language === "string" ? language : undefined),
    messages: [{ role: "user", content: userContent }]
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      // Sofort ein Status-Byte + Keepalive, falls das Modell bei großem Kontext
      // (viele Quellen) erst spät das erste Token liefert — sonst könnte der
      // 30s-Time-to-first-byte-Timeout vor dem ersten Delta zuschlagen.
      send({ type: "status" })
      const keepalive = setInterval(() => {
        try {
          send({ type: "ping" })
        } catch {
          // Controller bereits geschlossen — ignorieren.
        }
      }, 5000)
      let fullText = ""

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text
            send({ type: "text", text: event.delta.text })
          }
        }
        await stream.finalMessage()

        const content = fullText.trim()
        const title = deriveReportTitle(content, reportLabel)
        await db.update(reports).set({ title, content, status: "ready" }).where(eq(reports.id, created.id))

        send({
          type: "done",
          report: {
            id: created.id,
            type: reportTypeId,
            title,
            content,
            sourceCount,
            status: "ready",
            createdAt: created.createdAt.toISOString()
          }
        })
      } catch (err) {
        console.error("Bericht-Erstellung fehlgeschlagen:", err)
        await db.update(reports).set({ status: "failed", error: String(err) }).where(eq(reports.id, created.id))
        send({ type: "error", id: created.id, error: String(err) })
      } finally {
        clearInterval(keepalive)
        controller.close()
      }
    }
  })

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" }
  })
}
