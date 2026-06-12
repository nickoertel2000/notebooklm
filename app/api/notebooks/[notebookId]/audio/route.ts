import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { audioOverviews, sourceChunks, sources } from "@/db/schema"
import { getAnthropic, REPORT_MODEL } from "@/lib/anthropic"
import { AudioLength, buildScriptSystemPrompt, getAudioFormat, parseScript } from "@/lib/audio"
import { synthesizeSpeech } from "@/lib/gemini"
import { audioKey, putBinary } from "@/lib/s3"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"
export const maxDuration = 300

// Obergrenze für den Quellen-Kontext (~150k Zeichen ≈ ~45k Tokens).
const MAX_CONTEXT_CHARS = 150_000

// Token-Budget für das Skript je nach Länge (klein genug für einen TTS-Call).
const SCRIPT_MAX_TOKENS: Record<AudioLength, number> = { kurz: 1500, standard: 4000 }

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

// Audio-Übersicht erstellen: Zeile als 'processing' anlegen, Skript via Claude
// generieren, mit Gemini TTS vertonen, WAV nach S3, Zeile auf 'ready' setzen.
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

  // Alle Chunks der (ausgewählten) fertigen Quellen, geordnet nach Quelle und Position.
  const rows = await db
    .select({
      sourceId: sourceChunks.sourceId,
      sourceTitle: sources.title,
      idx: sourceChunks.idx,
      content: sourceChunks.content
    })
    .from(sourceChunks)
    .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
    .where(
      and(
        eq(sourceChunks.notebookId, notebookId),
        eq(sources.status, "ready"),
        selectedIds && selectedIds.length > 0 ? inArray(sourceChunks.sourceId, selectedIds) : undefined
      )
    )
    .orderBy(asc(sources.title), asc(sourceChunks.idx))

  if (rows.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = new Set(rows.map((r) => r.sourceId)).size

  const [created] = await db
    .insert(audioOverviews)
    .values({ notebookId, format: format.id, title: format.label, length, language, focus, sourceCount, status: "processing" })
    .returning({ id: audioOverviews.id, createdAt: audioOverviews.createdAt })

  try {
    // Kontext nach Quelle gruppiert aufbauen, bis das Zeichenbudget erreicht ist.
    let context = ""
    let currentSource = ""
    for (const row of rows) {
      if (row.sourceTitle !== currentSource) {
        currentSource = row.sourceTitle
        context += `\n\n=== Quelle: ${row.sourceTitle} ===\n`
      }
      context += row.content + "\n"
      if (context.length >= MAX_CONTEXT_CHARS) break
    }

    const focusLine = focus ? `\n\nLege den Fokus auf Folgendes: ${focus}` : ""
    const userContent = `Hier sind die Quellen des Notebooks:\n${context.trim()}\n\n---\n\nAufgabe: ${format.instruction}${focusLine}`

    // 1) Skript via Claude.
    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: SCRIPT_MAX_TOKENS[length],
      system: buildScriptSystemPrompt(format, length, language),
      messages: [{ role: "user", content: userContent }]
    })

    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    const { title, script } = parseScript(raw, format.label)
    if (!script) throw new Error("Leeres Skript erzeugt")

    // 2) Vertonen via Gemini TTS und nach S3 laden.
    const { wav, durationSeconds } = await synthesizeSpeech(script, format.speakers)
    const key = audioKey(notebookId, created.id)
    await putBinary(key, wav, "audio/wav")

    await db
      .update(audioOverviews)
      .set({ title, s3Key: key, durationSeconds, status: "ready" })
      .where(eq(audioOverviews.id, created.id))

    return NextResponse.json({
      audio: {
        id: created.id,
        format: format.id,
        title,
        durationSeconds,
        sourceCount,
        status: "ready",
        createdAt: created.createdAt.toISOString()
      }
    })
  } catch (err) {
    console.error("Audio-Erstellung fehlgeschlagen:", err)
    await db.update(audioOverviews).set({ status: "failed", error: String(err) }).where(eq(audioOverviews.id, created.id))
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
