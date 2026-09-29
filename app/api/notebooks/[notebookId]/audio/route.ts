import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { audioOverviews, sources } from "@/db/schema"
import { AudioLength, getAudioFormat } from "@/lib/audio"
import { startAudio } from "@/lib/jobs/start"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { readJsonBody, optionalString, parseSourceIds } from "@/lib/api/body"

// Audio-Übersichten, die länger als das hier in 'processing' hängen, gelten als
// abgebrochen und werden beim Auflisten auf 'failed' gesetzt — sonst pollt das
// Studio-Panel endlos. Großzügig, da TTS einer 'standard'-Länge dauern kann.
const STALE_PROCESSING_MS = 15 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

// Persistierte Audio-Übersichten des Notebooks auflisten (ohne storageKey) – fürs Studio-Panel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

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

// Audio-Übersicht erstellen: 'processing'-Zeile anlegen und den AudioWorkflow
// starten (Claude-Skript + Gemini-TTS im Jobs-Worker), das Frontend pollt.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)
  const format = getAudioFormat(String(body.format))
  if (!format) return NextResponse.json({ error: "Unbekanntes Audio-Format" }, { status: 400 })

  const length: AudioLength = body.length === "kurz" ? "kurz" : "standard"
  const language = typeof body.language === "string" ? body.language : "de"
  const focus = optionalString(body.focus)
  const selectedIds = parseSourceIds(body.sourceIds)

  // Sicherstellen, dass es überhaupt fertige Quellen gibt (schnelle Prüfung).
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
    .insert(audioOverviews)
    .values({ notebookId, format: format.id, title: format.label, length, language, focus, sourceCount, status: "processing" })
    .returning({ id: audioOverviews.id, createdAt: audioOverviews.createdAt })

  try {
    await startAudio({ audioId: created.id, notebookId, formatId: format.id, length, language, focus, sourceIds: selectedIds })
  } catch (err) {
    console.error("Audio-Workflow konnte nicht gestartet werden:", err)
    await db.update(audioOverviews).set({ status: "failed", error: "Erstellung konnte nicht gestartet werden" }).where(eq(audioOverviews.id, created.id))
    return NextResponse.json({ error: "Erstellung konnte nicht gestartet werden" }, { status: 500 })
  }

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
