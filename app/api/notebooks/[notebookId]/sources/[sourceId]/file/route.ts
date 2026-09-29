import { and, eq, isNull } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { startIngestSource } from "@/lib/jobs/start"
import { isUuid } from "@/lib/notebooks"
import { putObject, sourceKey } from "@/lib/storage"

// Der Worker hält beim Import das ganze PDF im Speicher (128 MB Limit).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

type RouteContext = { params: Promise<{ notebookId: string; sourceId: string }> }

// PDF-Upload für eine zuvor per POST sources angelegte Quelle. Der Body wird
// direkt nach R2 gestreamt, danach startet der Import-Workflow.
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { notebookId, sourceId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(sourceId)) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })

  const length = Number(req.headers.get("content-length"))
  if (!req.body || !length) return NextResponse.json({ error: "Leere Datei" }, { status: 400 })
  if (length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Die Datei ist größer als 50 MB" }, { status: 413 })
  if (req.headers.get("content-type") !== "application/pdf") return NextResponse.json({ error: "Nur PDF-Dateien werden unterstützt" }, { status: 415 })

  const db = getDb()
  // Nur einmal hochladbar: storageKey ist erst nach erfolgreichem Upload gesetzt.
  const [row] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId), eq(sources.type, "pdf"), isNull(sources.storageKey)))
    .limit(1)
  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden oder bereits hochgeladen" }, { status: 404 })

  // Fester Dateiname statt des Nutzer-Dateinamens: der landet sonst ungeprüft im R2-Key.
  const key = sourceKey(notebookId, sourceId, "original.pdf")
  try {
    await putObject(key, req.body, "application/pdf")
    await db.update(sources).set({ storageKey: key, updatedAt: new Date() }).where(eq(sources.id, sourceId))
    await startIngestSource({ sourceId, notebookId, key, isPdf: true })
  } catch (err) {
    console.error("PDF-Upload fehlgeschlagen:", err)
    await db.update(sources).set({ status: "failed", error: "Upload fehlgeschlagen", updatedAt: new Date() }).where(eq(sources.id, sourceId))
    return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
