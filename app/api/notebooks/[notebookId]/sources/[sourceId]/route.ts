import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sources } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser, isUuid } from "@/lib/notebooks"
import { deleteObject } from "@/lib/s3"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string; sourceId: string }> }

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
