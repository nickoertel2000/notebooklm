import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { audioOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { cancelJob } from "@/lib/jobs/start"
import { isUuid } from "@/lib/notebooks"
import { deleteObject } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string; audioId: string }> }

// Metadaten fürs Abspielen. Die Datei selbst liefert audio/[audioId]/file aus, der
// Storage-Key verlässt den Server nie.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, audioId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(audioId)) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  const [row] = await getDb()
    .select({
      id: audioOverviews.id,
      title: audioOverviews.title,
      durationSeconds: audioOverviews.durationSeconds,
      status: audioOverviews.status,
      storageKey: audioOverviews.storageKey,
      createdAt: audioOverviews.createdAt
    })
    .from(audioOverviews)
    .where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  const { storageKey, ...audio } = row
  const url = storageKey ? `/api/notebooks/${notebookId}/audio/${audioId}/file` : null
  return NextResponse.json({ audio: { ...audio, url, createdAt: row.createdAt.toISOString() } })
}

// Audio löschen: laufende Erstellung abbrechen, Datei und DB-Zeile entfernen.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, audioId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(audioId)) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  const db = getDb()
  const [row] = await db
    .select({ status: audioOverviews.status, storageKey: audioOverviews.storageKey })
    .from(audioOverviews)
    .where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
    .limit(1)
  if (!row) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  if (row.status === "processing") await cancelJob("audio", audioId)
  if (row.storageKey) {
    try {
      await deleteObject(row.storageKey)
    } catch (err) {
      console.error("Audio-Datei konnte nicht gelöscht werden:", err)
    }
  }

  await db.delete(audioOverviews).where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
  return NextResponse.json({ ok: true })
}
