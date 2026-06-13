import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sources, videoOverviews } from "@/db/schema"
import { putText } from "@/lib/s3"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import { getVideoFormat, getVisualStyle } from "@/lib/video"

export const runtime = "nodejs"

// Video-Übersichten, die länger als das hier in 'processing' hängen, gelten als
// abgebrochen und werden beim Auflisten auf 'failed' gesetzt — sonst pollt das
// Studio-Panel endlos. Großzügig: Skript + mehrere TTS-/Bild-Calls + ffmpeg.
const STALE_PROCESSING_MS = 10 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Persistierte Video-Übersichten des Notebooks auflisten (ohne s3Key) – fürs Studio-Panel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

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

// Video-Übersicht erstellen: 'processing'-Zeile anlegen und einen Job nach S3
// schreiben. Die lange Generierung (Claude-Skript + Gemini-TTS + Gemini-Bild +
// ffmpeg) übernimmt der ingest-Worker; das Frontend pollt.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const body = await req.json()
  const format = getVideoFormat(body.format)
  if (!format) return NextResponse.json({ error: "Unbekanntes Video-Format" }, { status: 400 })

  const style = getVisualStyle(body.visualStyle)
  if (!style) return NextResponse.json({ error: "Unbekannter visueller Stil" }, { status: 400 })

  const language = typeof body.language === "string" ? body.language : "Deutsch"
  const focus = typeof body.focus === "string" && body.focus.trim() ? body.focus.trim() : null
  const customStyle = style.id === "custom" && typeof body.customStyle === "string" && body.customStyle.trim() ? body.customStyle.trim() : null
  const selectedIds: string[] | null = Array.isArray(body.sourceIds) ? body.sourceIds.filter((id: unknown) => typeof id === "string") : null

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

  // Job-Datei nach S3 schreiben → triggert den ingest-Worker.
  const jobKey = `notebooks/${notebookId}/jobs/video/${created.id}.json`
  await putText(
    jobKey,
    JSON.stringify({
      kind: "video",
      videoId: created.id,
      notebookId,
      formatId: format.id,
      visualStyleId: style.id,
      customStyle,
      language,
      focus,
      sourceIds: selectedIds
    })
  )

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
