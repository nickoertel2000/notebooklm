import { and, eq, isNull } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { startIngestSource } from "@/lib/jobs/start"
import { isUuid } from "@/lib/uuid"
import { putObject, sourceKey } from "@/lib/storage"

// Der Import hält das ganze PDF im Speicher, Worker-Limit 128 MB.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

type RouteContext = { params: Promise<{ notebookId: string; sourceId: string }> }

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
  // Fester Dateiname, damit der Nutzer-Dateiname nie ungeprüft im R2-Key landet.
  const key = sourceKey(notebookId, sourceId, "original.pdf")
  // Nur einmal hochladbar. Der Key wird vor dem Upload gesetzt, damit zwei parallele Uploads nicht beide durchkommen.
  const [row] = await db
    .update(sources)
    .set({ storageKey: key, updatedAt: new Date() })
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId), eq(sources.type, "pdf"), isNull(sources.storageKey)))
    .returning({ id: sources.id })
  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden oder bereits hochgeladen" }, { status: 404 })

  let uploaded = false
  try {
    await putObject(key, req.body, "application/pdf")
    uploaded = true
    await startIngestSource({ sourceId, notebookId, key, isPdf: true })
  } catch (err) {
    console.error("PDF-Upload fehlgeschlagen:", err)
    // Ohne Datei in R2 den Key freigeben, sonst bliebe die Quelle für einen neuen Upload gesperrt.
    await db
      .update(sources)
      .set({ status: "failed", error: "Upload fehlgeschlagen", ...(uploaded ? {} : { storageKey: null }), updatedAt: new Date() })
      .where(eq(sources.id, sourceId))
    return NextResponse.json({ error: "Upload fehlgeschlagen" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
