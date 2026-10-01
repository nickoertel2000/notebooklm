import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { videoOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { startVideo } from "@/lib/jobs/start"
import { createStudioJob } from "@/lib/jobs/studioJob"
import { parseLanguage } from "@/lib/languages"
import { listVideos } from "@/lib/notebookItems"
import { getVideoFormat, getVisualStyle } from "@/lib/video"
import { lengthError, MAX_LENGTH, optionalString, readJsonBody } from "@/lib/api/body"

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  return NextResponse.json({ videos: await listVideos(getDb(), notebookId) })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)
  const tooLong = lengthError([
    [body.focus, MAX_LENGTH.focus],
    [body.customStyle, MAX_LENGTH.focus]
  ])
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 })
  const format = getVideoFormat(String(body.format))
  if (!format) return NextResponse.json({ error: "Unbekanntes Video-Format" }, { status: 400 })

  const style = getVisualStyle(String(body.visualStyle))
  if (!style) return NextResponse.json({ error: "Unbekannter visueller Stil" }, { status: 400 })

  const language = parseLanguage(body.language)
  const focus = optionalString(body.focus)
  const customStyle = style.id === "custom" ? optionalString(body.customStyle) : null

  const job = await createStudioJob({
    db,
    userId: auth.user.id,
    notebookId,
    sourceIds: body.sourceIds,
    label: "Video",
    insert: async (sourceCount) => {
      const [row] = await db
        .insert(videoOverviews)
        .values({ notebookId, format: format.id, title: format.label, visualStyle: style.id, customStyle, language, focus, sourceCount, status: "processing" })
        .returning({
          id: videoOverviews.id,
          format: videoOverviews.format,
          title: videoOverviews.title,
          visualStyle: videoOverviews.visualStyle,
          durationSeconds: videoOverviews.durationSeconds,
          sourceCount: videoOverviews.sourceCount,
          status: videoOverviews.status,
          createdAt: videoOverviews.createdAt
        })
      return row
    },
    start: (row, sourceIds) => startVideo({ videoId: row.id, notebookId, formatId: format.id, visualStyleId: style.id, customStyle, language, focus, sourceIds }),
    markFailed: (row, error) => db.update(videoOverviews).set({ status: "failed", error }).where(eq(videoOverviews.id, row.id))
  })
  if ("error" in job) return job.error

  return NextResponse.json({ video: { ...job.row, createdAt: job.row.createdAt.toISOString() } }, { status: 202 })
}
