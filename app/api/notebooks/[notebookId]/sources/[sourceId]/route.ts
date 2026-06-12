import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sourceChunks, sources } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser, isUuid } from "@/lib/notebooks"
import { deleteObject, retriggerIngest } from "@/lib/s3"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string; sourceId: string }> }

// Fehlgeschlagenen Import erneut versuchen: Der hochgeladene Inhalt liegt noch
// in S3 — durch erneutes Anstossen der Lambda wird er neu verarbeitet.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, sourceId } = await params

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 })
  if (!isUuid(sourceId)) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })

  const [row] = await db
    .select({ id: sources.id, s3Key: sources.s3Key })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })
  if (!row.s3Key) return NextResponse.json({ error: "Kein Inhalt zum Wiederholen vorhanden" }, { status: 422 })

  // Etwaige Teil-Chunks eines vorherigen Versuchs entfernen, damit keine
  // Duplikate entstehen, dann zurück auf „processing" setzen.
  await db.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId))
  await db.update(sources).set({ status: "processing", error: null, updatedAt: new Date() }).where(eq(sources.id, sourceId))

  try {
    await retriggerIngest(row.s3Key)
  } catch (err) {
    await db.update(sources).set({ status: "failed", error: String(err).slice(0, 500), updatedAt: new Date() }).where(eq(sources.id, sourceId))
    return NextResponse.json({ error: "Erneuter Versuch konnte nicht gestartet werden" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, sourceId } = await params

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 })
  if (!isUuid(sourceId)) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })

  const [row] = await db
    .select({ id: sources.id, s3Key: sources.s3Key })
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Quelle nicht gefunden" }, { status: 404 })

  if (row.s3Key) {
    try {
      await deleteObject(row.s3Key)
    } catch (err) {
      console.error("S3-Objekt konnte nicht gelöscht werden:", err)
    }
  }

  // Chunks werden per FK-Kaskade mitgelöscht.
  await db.delete(sources).where(eq(sources.id, sourceId))

  return NextResponse.json({ ok: true })
}
