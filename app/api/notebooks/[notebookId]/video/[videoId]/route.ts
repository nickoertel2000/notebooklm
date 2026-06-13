import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { videoOverviews } from "@/db/schema"
import { deleteObject, presignDownload } from "@/lib/s3"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string; videoId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Einzelne Video-Übersicht inkl. presigned Stream-URL für den Player.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, videoId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const [row] = await db
    .select()
    .from(videoOverviews)
    .where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  const url = row.s3Key ? await presignDownload(row.s3Key) : null
  return NextResponse.json({ video: { ...row, url, createdAt: row.createdAt.toISOString() } })
}

// Video-Übersicht löschen (DB-Zeile + MP4 in S3).
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, videoId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const [row] = await db
    .select({ s3Key: videoOverviews.s3Key })
    .from(videoOverviews)
    .where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
    .limit(1)

  if (row?.s3Key) {
    try {
      await deleteObject(row.s3Key)
    } catch (err) {
      console.error("S3-Video-Löschung fehlgeschlagen:", err)
    }
  }

  await db.delete(videoOverviews).where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
  return NextResponse.json({ ok: true })
}
