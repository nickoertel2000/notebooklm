import { and, asc, eq, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { extractFromUrl } from "@/lib/extract"
import { startIngestSource } from "@/lib/jobs/start"
import { putObject, sourceKey } from "@/lib/storage"

// Quellen, die so lange in 'processing' hängen, gelten als abgebrochen (z. B. PDF
// angelegt, Upload nie angekommen) – sonst pollt das Frontend endlos.
const STALE_PROCESSING_MS = 15 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

type CreateSourceBody = { type: "pdf"; filename?: string } | { type: "url"; url?: string } | { type: "text"; text?: string; title?: string }

// Quellen eines Notebooks auflisten (für Status-Polling).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()
  await db
    .update(sources)
    .set({ status: "failed", error: "Zeitüberschreitung beim Import", updatedAt: new Date() })
    .where(and(eq(sources.notebookId, notebookId), eq(sources.status, "processing"), lt(sources.updatedAt, new Date(Date.now() - STALE_PROCESSING_MS))))

  const rows = await db
    .select({
      id: sources.id,
      type: sources.type,
      title: sources.title,
      status: sources.status,
      error: sources.error,
      sourceUrl: sources.sourceUrl,
      createdAt: sources.createdAt
    })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
    .orderBy(asc(sources.createdAt))

  return NextResponse.json({ sources: rows })
}

// Neue Quelle anlegen. PDF: nur die Zeile – die Datei folgt per PUT auf
// sources/[sourceId]/file, das startet den Import. URL/Text: Inhalt wird direkt
// gespeichert und der Import sofort gestartet.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()
  const body = (await req.json()) as CreateSourceBody

  if (body.type === "pdf") {
    const filename = body.filename?.trim() || "dokument.pdf"
    const [row] = await db.insert(sources).values({ notebookId, type: "pdf", title: filename, status: "processing" }).returning({ id: sources.id })
    return NextResponse.json({ sourceId: row.id })
  }

  let title: string
  let text: string
  let sourceUrl: string | null = null

  if (body.type === "url") {
    if (!body.url) return NextResponse.json({ error: "URL fehlt" }, { status: 400 })
    try {
      const extracted = await extractFromUrl(body.url)
      title = extracted.title
      text = extracted.text
      sourceUrl = body.url
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 })
    }
  } else if (body.type === "text") {
    text = body.text ?? ""
    if (!text.trim()) return NextResponse.json({ error: "Text fehlt" }, { status: 400 })
    title = body.title?.trim() || text.trim().split("\n")[0].slice(0, 80) || "Eingefügter Text"
  } else {
    return NextResponse.json({ error: "Unbekannter Quelltyp" }, { status: 400 })
  }

  const [row] = await db.insert(sources).values({ notebookId, type: body.type, title, sourceUrl, status: "processing" }).returning({ id: sources.id })

  const key = sourceKey(notebookId, row.id, "content.txt")
  try {
    await putObject(key, text, "text/plain; charset=utf-8")
    await db.update(sources).set({ storageKey: key }).where(eq(sources.id, row.id))
    await startIngestSource({ sourceId: row.id, notebookId, key, isPdf: false })
  } catch (err) {
    console.error("Import konnte nicht gestartet werden:", err)
    await db.update(sources).set({ status: "failed", error: "Import konnte nicht gestartet werden", updatedAt: new Date() }).where(eq(sources.id, row.id))
  }

  return NextResponse.json({ sourceId: row.id })
}
