import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { startIngestSource } from "@/lib/jobs/start"
import { sourceRetryable } from "@/lib/notebookItems"
import { consumeQuota } from "@/lib/quota"
import { isUuid } from "@/lib/uuid"
import { deleteByPrefix, sourcePrefix } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string; sourceId: string }> }

async function findSource(notebookId: string, sourceId: string) {
  if (!isUuid(sourceId)) return null
  const [row] = await getDb()
    .select({ id: sources.id, type: sources.type, storageKey: sources.storageKey })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId)))
    .limit(1)
  return row ?? null
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, sourceId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const row = await findSource(notebookId, sourceId)
  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })
  if (!row.storageKey) return NextResponse.json({ error: "Kein Inhalt zum Wiederholen vorhanden" }, { status: 422 })

  const quotaError = await consumeQuota(auth.user.id, "source")
  if (quotaError) return NextResponse.json({ error: quotaError }, { status: 429 })

  const db = getDb()
  // Bedingtes Update statt Lesen und Schreiben: Ein Doppelklick startet sonst zwei Importe.
  const [claimed] = await db
    .update(sources)
    .set({ status: "processing", error: null, updatedAt: new Date() })
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId), sourceRetryable))
    .returning({ id: sources.id })
  if (!claimed) return NextResponse.json({ error: "Nur fehlgeschlagene Importe lassen sich wiederholen" }, { status: 409 })
  await db.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId))

  try {
    await startIngestSource({ sourceId, notebookId, key: row.storageKey, isPdf: row.type === "pdf" })
  } catch (err) {
    console.error("Import konnte nicht gestartet werden:", err)
    await db.update(sources).set({ status: "failed", error: "Import konnte nicht gestartet werden", updatedAt: new Date() }).where(eq(sources.id, sourceId))
    return NextResponse.json({ error: "Erneuter Versuch konnte nicht gestartet werden" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, sourceId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const row = await findSource(notebookId, sourceId)
  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })

  try {
    await deleteByPrefix(sourcePrefix(notebookId, sourceId))
  } catch (err) {
    console.error("Dateien der Quelle konnten nicht gelöscht werden:", err)
  }

  // Kein cancelJob nötig: Ein laufender Import bricht beim nächsten Schritt ab, weil die Quelle fehlt.
  await getDb().delete(sources).where(eq(sources.id, sourceId))

  return NextResponse.json({ ok: true })
}
