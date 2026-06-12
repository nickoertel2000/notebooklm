import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { audioOverviews, sources } from "@/db/schema"
import { AudioLength, getAudioFormat } from "@/lib/audio"
import { putText } from "@/lib/s3"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"

// Audio-Übersichten, die länger als das hier in 'processing' hängen, gelten als
// abgebrochen und werden beim Auflisten auf 'failed' gesetzt — sonst pollt das
// Studio-Panel endlos. Großzügig, da TTS einer 'standard'-Länge dauern kann.
const STALE_PROCESSING_MS = 8 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Persistierte Audio-Übersichten des Notebooks auflisten (ohne s3Key) – fürs Studio-Panel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  // Hängengebliebene 'processing'-Audios aufräumen, bevor wir auflisten.
  await db
    .update(audioOverviews)
    .set({ status: "failed", error: "Zeitüberschreitung bei der Erstellung" })
    .where(
      and(
        eq(audioOverviews.notebookId, notebookId),
        eq(audioOverviews.status, "processing"),
        lt(audioOverviews.createdAt, new Date(Date.now() - STALE_PROCESSING_MS))
      )
    )

  const rows = await db
    .select({
      id: audioOverviews.id,
      format: audioOverviews.format,
      title: audioOverviews.title,
      durationSeconds: audioOverviews.durationSeconds,
      sourceCount: audioOverviews.sourceCount,
      status: audioOverviews.status,
      createdAt: audioOverviews.createdAt
    })
    .from(audioOverviews)
    .where(eq(audioOverviews.notebookId, notebookId))
    .orderBy(desc(audioOverviews.createdAt))

  return NextResponse.json({ audios: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) })
}

// Audio-Übersicht erstellen: 'processing'-Zeile anlegen und einen Job nach S3
// schreiben. Die lange Generierung (Claude-Skript + Gemini-TTS) übernimmt der
// ingest-Worker; das Frontend pollt. So umgehen wir das 30s-Timeout des SSR.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const body = await req.json()
  const format = getAudioFormat(body.format)
  if (!format) return NextResponse.json({ error: "Unbekanntes Audio-Format" }, { status: 400 })

  const length: AudioLength = body.length === "kurz" ? "kurz" : "standard"
  const language = typeof body.language === "string" ? body.language : "de"
  const focus = typeof body.focus === "string" && body.focus.trim() ? body.focus.trim() : null
  const selectedIds: string[] | null = Array.isArray(body.sourceIds)
    ? body.sourceIds.filter((id: unknown) => typeof id === "string")
    : null

  // Sicherstellen, dass es überhaupt fertige Quellen gibt (schnelle Prüfung).
  const ready = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.status, "ready"),
        selectedIds && selectedIds.length > 0 ? inArray(sources.id, selectedIds) : undefined
      )
    )

  if (ready.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = ready.length

  const [created] = await db
    .insert(audioOverviews)
    .values({ notebookId, format: format.id, title: format.label, length, language, focus, sourceCount, status: "processing" })
    .returning({ id: audioOverviews.id, createdAt: audioOverviews.createdAt })

  // Job-Datei nach S3 schreiben → triggert den ingest-Worker.
  const jobKey = `notebooks/${notebookId}/jobs/audio/${created.id}.json`
  await putText(
    jobKey,
    JSON.stringify({
      kind: "audio",
      audioId: created.id,
      notebookId,
      formatId: format.id,
      length,
      language,
      focus,
      sourceIds: selectedIds
    })
  )

  return NextResponse.json(
    {
      audio: {
        id: created.id,
        format: format.id,
        title: format.label,
        durationSeconds: null,
        sourceCount,
        status: "processing",
        createdAt: created.createdAt.toISOString()
      }
    },
    { status: 202 }
  )
}
