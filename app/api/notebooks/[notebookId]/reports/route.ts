import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { reports, sourceChunks, sources } from "@/db/schema"
import { deriveReportTitle, getReportType, REPORT_SYSTEM_PROMPT } from "@/lib/reports"
import { getAnthropic, REPORT_MODEL } from "@/lib/anthropic"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"
export const maxDuration = 120

// Obergrenze für den Quellen-Kontext (~150k Zeichen ≈ ~45k Tokens).
const MAX_CONTEXT_CHARS = 150_000

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

  const { type, sourceIds } = await req.json()
  const reportType = getReportType(type)
  if (!reportType) return NextResponse.json({ error: "Unbekannter Bericht-Typ" }, { status: 400 })

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
    .values({ notebookId, type: reportType.id, title: reportType.label, sourceCount, status: "processing" })
    .returning({ id: reports.id, createdAt: reports.createdAt })

  try {
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

    const userContent = `Hier sind die Quellen des Notebooks:\n${context.trim()}\n\n---\n\nAufgabe: ${reportType.instruction}`

    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: 8000,
      system: REPORT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }]
    })

    const content = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    const title = deriveReportTitle(content, reportType.label)

    await db.update(reports).set({ title, content, status: "ready" }).where(eq(reports.id, created.id))

    return NextResponse.json({
      report: {
        id: created.id,
        type: reportType.id,
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
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
