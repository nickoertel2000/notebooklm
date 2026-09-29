import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { videoOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { cancelJob } from "@/lib/jobs/start"
import { isUuid } from "@/lib/notebooks"
import { deleteNotebookObject } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string; videoId: string }> }

// Metadaten fürs Abspielen. Die Datei selbst liefert video/[videoId]/file aus, der
// Storage-Key verlässt den Server nie.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, videoId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(videoId)) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  const [row] = await getDb()
    .select({
      id: videoOverviews.id,
      title: videoOverviews.title,
      durationSeconds: videoOverviews.durationSeconds,
      status: videoOverviews.status,
      storageKey: videoOverviews.storageKey,
      createdAt: videoOverviews.createdAt
    })
    .from(videoOverviews)
    .where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  const { storageKey, ...video } = row
  const url = storageKey ? `/api/notebooks/${notebookId}/video/${videoId}/file` : null
  return NextResponse.json({ video: { ...video, url, createdAt: row.createdAt.toISOString() } })
}

// Video löschen: laufende Erstellung abbrechen, Datei und DB-Zeile entfernen.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, videoId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(videoId)) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  const db = getDb()
  const [row] = await db
    .select({ status: videoOverviews.status, storageKey: videoOverviews.storageKey })
    .from(videoOverviews)
    .where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
    .limit(1)
  if (!row) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  if (row.status === "processing") await cancelJob("video", videoId)
  if (row.storageKey) {
    try {
      await deleteNotebookObject(notebookId, row.storageKey)
    } catch (err) {
      console.error("Video-Datei konnte nicht gelöscht werden:", err)
    }
  }

  await db.delete(videoOverviews).where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
  return NextResponse.json({ ok: true })
}
