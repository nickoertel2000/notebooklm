import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { audioOverviews } from "@/db/schema"
import { deleteObject, presignDownload } from "@/lib/s3"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string; audioId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Einzelne Audio-Übersicht inkl. presigned Stream-URL für den Player.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, audioId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const [row] = await db
    .select()
    .from(audioOverviews)
    .where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  const url = row.s3Key ? await presignDownload(row.s3Key) : null
  return NextResponse.json({ audio: { ...row, url, createdAt: row.createdAt.toISOString() } })
}

// Audio-Übersicht löschen (DB-Zeile + WAV in S3).
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, audioId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const [row] = await db
    .select({ s3Key: audioOverviews.s3Key })
    .from(audioOverviews)
    .where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
    .limit(1)

  if (row?.s3Key) {
    try {
      await deleteObject(row.s3Key)
    } catch (err) {
      console.error("S3-Audio-Löschung fehlgeschlagen:", err)
    }
  }

  await db.delete(audioOverviews).where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
  return NextResponse.json({ ok: true })
}
