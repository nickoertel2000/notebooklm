/**
 * Lokaler End-to-End-Test der Video-Übersicht (Option B): Claude-Skript +
 * Gemini-TTS + Gemini-Bild („Nano Banana") + ffmpeg-drawtext → MP4 auf Disk.
 * Nutzt exakt dieselbe Render-Pipeline wie der Produktions-Worker (lib/videoRender).
 *
 * Ausführen:
 *   npx tsx scripts/video-local.ts <notebookId> [--format explainer|summary] [--style auto|classic|whiteboard|kawaii|custom] [--custom "..."] [--language Deutsch] [--focus "..."] [--sources id1,id2]
 *
 * Voraussetzungen (lokal):
 *   pnpm add -D ffmpeg-static tsx
 *   .env.local mit DATABASE_URL, ANTHROPIC_API_KEY, GEMINI_API_KEY
 */

import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

import { and, asc, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../db/schema"
import { getAnthropic, REPORT_MODEL } from "../lib/anthropic"
import { buildVideoScriptSystemPrompt, getVideoFormat, getVisualStyle, parseVideoScript } from "../lib/video"
import { buildRenderSegments, composeVideo } from "../lib/videoRender"

function parseArgs(argv: string[]) {
  const positionals: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? ""
    else positionals.push(a)
  }
  const notebookId = positionals[0]
  if (!notebookId) {
    console.error(
      'Usage: npx tsx scripts/video-local.ts <notebookId> [--format explainer|summary] [--style auto|classic|whiteboard|kawaii|custom] [--custom "..."] [--language Deutsch] [--focus "..."] [--sources id1,id2]'
    )
    process.exit(1)
  }
  return {
    notebookId,
    formatId: flags.format || "explainer",
    styleId: flags.style || "auto",
    customStyle: flags.custom || null,
    language: flags.language || "Deutsch",
    focus: flags.focus || null,
    sourceIds: flags.sources
      ? flags.sources
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null
  }
}

const MAX_CONTEXT_CHARS = 150_000

async function buildContext(db: ReturnType<typeof drizzle<typeof schema>>, notebookId: string, sourceIds: string[] | null): Promise<string> {
  const rows = await db
    .select({ sourceTitle: schema.sources.title, content: schema.sourceChunks.content })
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  for (const key of ["DATABASE_URL", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
    if (!process.env[key]) throw new Error(`Env-Variable fehlt: ${key} (in .env.local setzen)`)
  }

  const format = getVideoFormat(args.formatId)
  if (!format) throw new Error(`Unbekanntes Format: ${args.formatId}`)
  const style = getVisualStyle(args.styleId)
  if (!style) throw new Error(`Unbekannter Stil: ${args.styleId}`)

  const sql = postgres(process.env.DATABASE_URL as string, { prepare: false })
  const db = drizzle(sql, { schema })

  const outDir = path.resolve("tmp", "video", args.notebookId)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  try {
    console.log("→ Lade Quellen-Kontext …")
    const context = await buildContext(db, args.notebookId, args.sourceIds)
    if (!context) throw new Error("Keine fertigen Quellen (Status 'ready') für dieses Notebook gefunden")
    console.log(`  Kontext: ${context.length} Zeichen`)

    console.log("→ Erzeuge Skript via Claude …")
    const userContent = `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nErzeuge daraus eine Video-Übersicht.`
    const message = await getAnthropic().messages.create({
      model: REPORT_MODEL,
      max_tokens: 4000,
      system: buildVideoScriptSystemPrompt(format, args.language, args.focus),
      messages: [{ role: "user", content: userContent }]
    })
    const rawScript = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
    const { title, segments } = parseVideoScript(rawScript)
    console.log(`  Titel: „${title}" — ${segments.length} Folien`)

    console.log("→ Erzeuge Vertonung + Folien-Bilder (parallel) …")
    const renderSegments = await buildRenderSegments(segments, style, args.customStyle)

    console.log("→ Rendere Video (ffmpeg) …")
    const { mp4, durationSeconds } = await composeVideo(renderSegments)
    const outPath = path.join(outDir, "out.mp4")
    await writeFile(outPath, mp4)
    console.log(`\n✓ Fertig: ${outPath}  (${durationSeconds}s, ${(mp4.length / 1024 / 1024).toFixed(1)} MB)`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error("\n✗ Fehlgeschlagen:", err instanceof Error ? err.message : err)
  process.exit(1)
})
