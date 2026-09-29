import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { videoOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { isUuid } from "@/lib/notebooks"
import { serveObject } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string; videoId: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { notebookId, videoId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(videoId)) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  const [row] = await getDb()
    .select({ storageKey: videoOverviews.storageKey })
    .from(videoOverviews)
    .where(and(eq(videoOverviews.id, videoId), eq(videoOverviews.notebookId, notebookId)))
    .limit(1)
  if (!row?.storageKey) return NextResponse.json({ error: "Video nicht gefunden" }, { status: 404 })

  return serveObject(req, row.storageKey, `${videoId}.mp4`)
}
