import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { S3Handler } from "aws-lambda"
import { and, asc, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { extractText } from "unpdf"
import * as schema from "../../../db/schema"
import { getAnthropic, REPORT_MODEL } from "../../../lib/anthropic"
import { AudioLength, buildScriptSystemPrompt, getAudioFormat, parseScript } from "../../../lib/audio"
import { chunkText } from "../../../lib/chunk"
import { synthesizeSpeech } from "../../../lib/gemini"
import { buildReportSystemPrompt, deriveReportTitle } from "../../../lib/reports"
import { buildVideoScriptSystemPrompt, getVideoFormat, getVisualStyle, parseVideoScript } from "../../../lib/video"
import { buildRenderSegments, composeVideo } from "../../../lib/videoRender"
import { embedTexts } from "../../../lib/voyage"

const s3 = new S3Client({})
// Supabase-Pooler: prepared statements deaktivieren.
const sql = postgres(process.env.DATABASE_URL as string, { prepare: false })
const db = drizzle(sql, { schema })

const EMBED_BATCH = 100

// Obergrenze für den Quellen-Kontext (~150k Zeichen ≈ ~45k Tokens).
const MAX_CONTEXT_CHARS = 150_000

// Token-Budget für das Audio-Skript je nach Länge.
const SCRIPT_MAX_TOKENS: Record<AudioLength, number> = { kurz: 1500, standard: 4000 }

// PostgreSQL erlaubt keine NUL-Bytes (0x00) in text-Spalten — PDFs enthalten die
// aber häufig. Vor jedem DB-Write entfernen, sonst Fehler 22021.
const NUL = String.fromCharCode(0)
const stripNul = (s: string) => s.split(NUL).join("")

// Key-Schema: notebooks/{notebookId}/{section}/...
// section === "sources" → Quelle ingesten
// section === "jobs"    → Generierungs-Job (jobs/report/{id}.json | jobs/audio/{id}.json)
// alles andere (z. B. notebooks/{nb}/audio/{id}.wav) wird ignoriert, damit vom
// Worker selbst geschriebene Dateien keine erneute Verarbeitung auslösen.
export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "))
    const parts = key.split("/")
    const notebookId = parts[1]
    const section = parts[2]
    if (!notebookId || !section) continue

    if (section === "sources") {
      await processSource(bucket, key, notebookId, parts[3], parts[4] ?? "")
    } else if (section === "jobs") {
      await processJob(bucket, key)
    }
    // sonst: ignorieren.
  }
}

// ───────────────────────── Quellen-Ingestion ─────────────────────────

async function processSource(bucket: string, key: string, notebookId: string, sourceId: string, filename: string) {
  if (!sourceId) return

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const bytes = await obj.Body!.transformToByteArray()

    let text: string
    if (filename.toLowerCase().endsWith(".pdf")) {
      const result = await extractText(new Uint8Array(bytes), { mergePages: true })
      text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text
    } else {
      text = new TextDecoder("utf-8").decode(bytes)
    }

    text = stripNul(text)

    const chunks = chunkText(text)

    const rows: (typeof schema.sourceChunks.$inferInsert)[] = []
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH)
      const vectors = await embedTexts(
        batch.map((c) => c.content),
        "document"
      )
      batch.forEach((c, j) => {
        rows.push({
          sourceId,
          notebookId,
          idx: c.idx,
          content: c.content,
          embedding: vectors[j],
          page: c.page,
          charStart: c.charStart,
          charEnd: c.charEnd
        })
      })
    }

    if (rows.length > 0) {
      await db.insert(schema.sourceChunks).values(rows)
    }

    await db.update(schema.sources).set({ status: "ready", charCount: text.length, updatedAt: new Date() }).where(eq(schema.sources.id, sourceId))
  } catch (err) {
    console.error("Ingestion fehlgeschlagen für", key, err)
    await db
      .update(schema.sources)
      .set({ status: "failed", error: stripNul(String(err)).slice(0, 500), updatedAt: new Date() })
      .where(eq(schema.sources.id, sourceId))
  }
}

// ───────────────────────── Generierungs-Jobs ─────────────────────────

type ReportJob = {
  kind: "report"
  reportId: string
  notebookId: string
  instruction: string
  reportLabel: string
  language?: string
  sourceIds: string[] | null
}

type AudioJob = {
  kind: "audio"
  audioId: string
  notebookId: string
  formatId: string
  length: AudioLength
  language: string
  focus: string | null
  sourceIds: string[] | null
}

type VideoJob = {
  kind: "video"
  videoId: string
  notebookId: string
  formatId: string
  visualStyleId: string
  customStyle: string | null
  language: string
  focus: string | null
  sourceIds: string[] | null
}

async function processJob(bucket: string, key: string) {
  let job: ReportJob | AudioJob | VideoJob
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    job = JSON.parse(await obj.Body!.transformToString("utf-8"))
  } catch (err) {
    console.error("Job-Datei konnte nicht gelesen werden:", key, err)
    return
  }

  try {
    if (job.kind === "report") {
      await processReportJob(job)
    } else if (job.kind === "audio") {
      await processAudioJob(bucket, job)
    } else if (job.kind === "video") {
      await processVideoJob(bucket, job)
    }
  } finally {
    // Abgearbeitete Job-Datei aufräumen (ObjectRemoved triggert keinen erneuten Lauf).
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch((err) => console.error("Job-Datei löschen fehlgeschlagen:", key, err))
  }
}

// Quellen-Chunks der (ausgewählten) fertigen Quellen, geordnet, zu einem
// Kontext-String zusammenbauen (bis zum Zeichenbudget).
async function buildContext(notebookId: string, sourceIds: string[] | null): Promise<string> {
  const rows = await db
    .select({
      sourceTitle: schema.sources.title,
      content: schema.sourceChunks.content
    })
    .from(schema.sourceChunks)
    .innerJoin(schema.sources, eq(schema.sourceChunks.sourceId, schema.sources.id))
    .where(
      and(
        eq(schema.sourceChunks.notebookId, notebookId),
        eq(schema.sources.status, "ready"),
        sourceIds && sourceIds.length > 0 ? inArray(schema.sourceChunks.sourceId, sourceIds) : undefined
      )
    )
    .orderBy(asc(schema.sources.title), asc(schema.sourceChunks.idx))

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
  return context.trim()
}

async function processReportJob(job: ReportJob) {
  try {
    const context = await buildContext(job.notebookId, job.sourceIds)
    const userContent = `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nAufgabe: ${job.instruction}`

    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: 8000,
      system: buildReportSystemPrompt(job.language),
      messages: [{ role: "user", content: userContent }]
    })

    const content = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    const title = deriveReportTitle(content, job.reportLabel)
    await db.update(schema.reports).set({ title, content, status: "ready" }).where(eq(schema.reports.id, job.reportId))
  } catch (err) {
    console.error("Bericht-Erstellung fehlgeschlagen:", job.reportId, err)
    await db
      .update(schema.reports)
      .set({ status: "failed", error: stripNul(String(err)).slice(0, 500) })
      .where(eq(schema.reports.id, job.reportId))
  }
}

async function processAudioJob(bucket: string, job: AudioJob) {
  try {
    const format = getAudioFormat(job.formatId)
    if (!format) throw new Error(`Unbekanntes Audio-Format: ${job.formatId}`)

    const context = await buildContext(job.notebookId, job.sourceIds)
    const focusLine = job.focus ? `\n\nLege den Fokus auf Folgendes: ${job.focus}` : ""
    const userContent = `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nAufgabe: ${format.instruction}${focusLine}`

    // 1) Skript via Claude.
    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: SCRIPT_MAX_TOKENS[job.length],
      system: buildScriptSystemPrompt(format, job.length, job.language),
      messages: [{ role: "user", content: userContent }]
    })

    const rawScript = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    const { title, script } = parseScript(rawScript, format.label)
    if (!script) throw new Error("Leeres Skript erzeugt")

    // 2) Vertonen via Gemini TTS und in denselben Bucket laden (Event-Bucket,
    // kein S3_BUCKET_NAME-Env nötig — vermeidet Stack-Zyklus storage↔function).
    const { wav, durationSeconds } = await synthesizeSpeech(script, format.speakers)
    const audioS3Key = `notebooks/${job.notebookId}/audio/${job.audioId}.wav`
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: audioS3Key, Body: wav, ContentType: "audio/wav" }))

    await db.update(schema.audioOverviews).set({ title, s3Key: audioS3Key, durationSeconds, status: "ready" }).where(eq(schema.audioOverviews.id, job.audioId))
  } catch (err) {
    console.error("Audio-Erstellung fehlgeschlagen:", job.audioId, err)
    await db
      .update(schema.audioOverviews)
      .set({ status: "failed", error: stripNul(String(err)).slice(0, 500) })
      .where(eq(schema.audioOverviews.id, job.audioId))
  }
}

async function processVideoJob(bucket: string, job: VideoJob) {
  try {
    const format = getVideoFormat(job.formatId)
    if (!format) throw new Error(`Unbekanntes Video-Format: ${job.formatId}`)
    const style = getVisualStyle(job.visualStyleId)
    if (!style) throw new Error(`Unbekannter visueller Stil: ${job.visualStyleId}`)

    const context = await buildContext(job.notebookId, job.sourceIds)

    // 1) Strukturiertes Skript (Folien + Narration) via Claude.
    const userContent = `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nErzeuge daraus eine Video-Übersicht.`
    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: 4000,
      system: buildVideoScriptSystemPrompt(format, job.language, job.focus),
      messages: [{ role: "user", content: userContent }]
    })
    const rawScript = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
    const { title, segments } = parseVideoScript(rawScript)

    // 2) Pro Folie: Vertonung (Gemini TTS) + Hintergrund (Gemini Image) – parallel
    // und über die Folien hinweg nebenläufig (siehe buildRenderSegments).
    const renderSegments = await buildRenderSegments(segments, style, job.customStyle)

    // 3) ffmpeg: Folien zur MP4 zusammensetzen und in den Event-Bucket laden.
    const { mp4, durationSeconds } = await composeVideo(renderSegments)
    const videoS3Key = `notebooks/${job.notebookId}/video/${job.videoId}.mp4`
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: videoS3Key, Body: mp4, ContentType: "video/mp4" }))

    await db.update(schema.videoOverviews).set({ title, s3Key: videoS3Key, durationSeconds, status: "ready" }).where(eq(schema.videoOverviews.id, job.videoId))
  } catch (err) {
    console.error("Video-Erstellung fehlgeschlagen:", job.videoId, err)
    await db
      .update(schema.videoOverviews)
      .set({ status: "failed", error: stripNul(String(err)).slice(0, 500) })
      .where(eq(schema.videoOverviews.id, job.videoId))
  }
}
