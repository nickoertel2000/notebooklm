import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sources, videoOverviews } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { startVideo } from "@/lib/jobs/start"
import { getVideoFormat, getVisualStyle } from "@/lib/video"
import { readJsonBody, optionalString, parseSourceIds } from "@/lib/api/body"

// Großzügig: Skript, TTS und Bild pro Folie, danach das Rendern.
const STALE_PROCESSING_MS = 20 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  await db
    .update(videoOverviews)
    .set({ status: "failed", error: "Zeitüberschreitung bei der Erstellung" })
    .where(
      and(
        eq(videoOverviews.notebookId, notebookId),
        eq(videoOverviews.status, "processing"),
        lt(videoOverviews.createdAt, new Date(Date.now() - STALE_PROCESSING_MS))
      )
    )

  const rows = await db
    .select({
      id: videoOverviews.id,
      format: videoOverviews.format,
      title: videoOverviews.title,
      visualStyle: videoOverviews.visualStyle,
      durationSeconds: videoOverviews.durationSeconds,
      sourceCount: videoOverviews.sourceCount,
      status: videoOverviews.status,
      createdAt: videoOverviews.createdAt
    })
    .from(videoOverviews)
    .where(eq(videoOverviews.notebookId, notebookId))
    .orderBy(desc(videoOverviews.createdAt))

  return NextResponse.json({ videos: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)
  const format = getVideoFormat(String(body.format))
  if (!format) return NextResponse.json({ error: "Unbekanntes Video-Format" }, { status: 400 })

  const style = getVisualStyle(String(body.visualStyle))
  if (!style) return NextResponse.json({ error: "Unbekannter visueller Stil" }, { status: 400 })

  const language = typeof body.language === "string" ? body.language : "Deutsch"
  const focus = optionalString(body.focus)
  const customStyle = style.id === "custom" ? optionalString(body.customStyle) : null
  const selectedIds = parseSourceIds(body.sourceIds)

  const ready = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(eq(sources.notebookId, notebookId), eq(sources.status, "ready"), selectedIds && selectedIds.length > 0 ? inArray(sources.id, selectedIds) : undefined)
    )

  if (ready.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = ready.length

  const [created] = await db
    .insert(videoOverviews)
    .values({
      notebookId,
      format: format.id,
      title: format.label,
      visualStyle: style.id,
      customStyle,
      language,
      focus,
      sourceCount,
      status: "processing"
    })
    .returning({ id: videoOverviews.id, createdAt: videoOverviews.createdAt })

  try {
    await startVideo({
      videoId: created.id,
      notebookId,
      formatId: format.id,
      visualStyleId: style.id,
      customStyle,
      language,
      focus,
      sourceIds: selectedIds
    })
  } catch (err) {
    console.error("Video-Workflow konnte nicht gestartet werden:", err)
    await db.update(videoOverviews).set({ status: "failed", error: "Erstellung konnte nicht gestartet werden" }).where(eq(videoOverviews.id, created.id))
    return NextResponse.json({ error: "Erstellung konnte nicht gestartet werden" }, { status: 500 })
  }

  return NextResponse.json(
    {
      video: {
        id: created.id,
        format: format.id,
        title: format.label,
        visualStyle: style.id,
        durationSeconds: null,
        sourceCount,
        status: "processing",
        createdAt: created.createdAt.toISOString()
      }
    },
    { status: 202 }
  )
}
