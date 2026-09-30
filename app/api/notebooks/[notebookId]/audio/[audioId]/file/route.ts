import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { audioOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { isUuid } from "@/lib/uuid"
import { serveObject } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string; audioId: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { notebookId, audioId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(audioId)) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  const [row] = await getDb()
    .select({ storageKey: audioOverviews.storageKey })
    .from(audioOverviews)
    .where(and(eq(audioOverviews.id, audioId), eq(audioOverviews.notebookId, notebookId)))
    .limit(1)
  if (!row?.storageKey) return NextResponse.json({ error: "Audio nicht gefunden" }, { status: 404 })

  return serveObject(req, row.storageKey, `${audioId}.wav`)
}
