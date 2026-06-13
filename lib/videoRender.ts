// Node-only: baut aus Folien (Hintergrund-PNG + Vertonung-WAV + Texten) eine MP4.
// Wird vom ingest-Worker (amplify/functions/ingest/handler.ts) und vom lokalen
// Testskript (scripts/video-local.ts) genutzt. NICHT aus Client-/Edge-Code
// importieren (verwendet child_process, fs, os).

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { NOTO_SANS_TTF_BASE64 } from "./fontData"
import { generateImage, synthesizeSpeech } from "./gemini"
import { buildSlideImagePrompt, SLIDE_HEIGHT, SLIDE_WIDTH, VideoSegment, VisualStyle, wrapText } from "./video"

const execFileAsync = promisify(execFile)

export type RenderSegment = {
  // Hintergrund-PNG (Nano Banana). null → einfarbiger Fallback-Hintergrund.
  background: Buffer | null
  // Vertonung als WAV (Gemini TTS, 24 kHz mono 16-bit PCM).
  wav: Buffer
  slideTitle: string
  bullets: string[]
}

// Wie viele Folien gleichzeitig generiert werden (je Folie zusätzlich TTS + Bild
// parallel). Klein genug, um Gemini-Rate-Limits nicht zu reißen; per Env anpassbar.
const SLIDE_CONCURRENCY = Math.max(1, Number(process.env.VIDEO_SLIDE_CONCURRENCY) || 3)

// Erzeugt für alle Folien Vertonung (TTS) und Hintergrund (Nano Banana). Pro Folie
// laufen TTS und Bild parallel; über die Folien hinweg mit Concurrency-Limit. Die
// Reihenfolge bleibt erhalten. Schlägt die Bildgenerierung fehl (z. B. Rate-Limit),
// fällt die Folie auf einen einfarbigen Hintergrund zurück.
export async function buildRenderSegments(segments: VideoSegment[], style: VisualStyle, customStyle: string | null): Promise<RenderSegment[]> {
  const results = new Array<RenderSegment>(segments.length)
  let nextIndex = 0

  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= segments.length) return
      const seg = segments[i]
      const [wav, background] = await Promise.all([
        synthesizeSpeech(seg.narration, 1).then((r) => r.wav),
        generateImage(buildSlideImagePrompt(style, customStyle, seg)).catch((err) => {
          console.error(`Folien-Bild fehlgeschlagen (Fallback einfarbig), Folie ${i + 1}:`, err instanceof Error ? err.message : err)
          return null
        })
      ])
      results[i] = { background, wav, slideTitle: seg.slideTitle, bullets: seg.bullets }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SLIDE_CONCURRENCY, segments.length) }, worker))
  return results
}

export type RenderResult = { mp4: Buffer; durationSeconds: number }

// ffmpeg-Binary auflösen: in der Lambda via Layer (FFMPEG_PATH=/opt/bin/ffmpeg),
// lokal via ffmpeg-static. Dynamischer Import, damit ffmpeg-static im Lambda-
// Bundle nicht zwingend vorhanden sein muss.
async function resolveFfmpeg(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default: string | null }
    if (mod.default) return mod.default
  } catch {
    // ignorieren – Fehler unten
  }
  throw new Error("Kein ffmpeg gefunden: FFMPEG_PATH setzen oder ffmpeg-static installieren")
}

// Dauer eines 24-kHz-Mono-16-bit-WAV (abzüglich 44-Byte-Header).
function wavDurationSeconds(wav: Buffer): number {
  const dataBytes = Math.max(0, wav.length - 44)
  return dataBytes / (24000 * 1 * 2)
}

// Escaped Backslashes für eine drawtext-textfile-Datei ist nicht nötig, weil wir
// expansion=none nutzen und mit relativen Dateinamen aus dem cwd arbeiten.

// Baut die -vf-Filterkette für eine Folie aus relativen Dateinamen.
function buildSlideFilter(opts: {
  hasBackground: boolean
  bgName: string
  titleFile: string
  bodyFile: string
  footFile: string
  fontFile: string
  titleLines: number
}): string {
  const { hasBackground, titleLines } = opts
  const parts: string[] = []

  // Hintergrund auf 1280×720 bringen (cover + crop) bzw. bei Fallback nichts.
  if (hasBackground) {
    parts.push(`scale=${SLIDE_WIDTH}:${SLIDE_HEIGHT}:force_original_aspect_ratio=increase`)
    parts.push(`crop=${SLIDE_WIDTH}:${SLIDE_HEIGHT}`)
  }
  // Abdunkelnder Schleier für Lesbarkeit unabhängig vom Bildmotiv.
  parts.push(`drawbox=x=0:y=0:w=${SLIDE_WIDTH}:h=${SLIDE_HEIGHT}:color=black@0.42:t=fill`)

  const titleY = 120
  const bodyY = titleY + titleLines * 66 + 44

  // Titel (groß, mit Schatten für Kontrast).
  parts.push(
    `drawtext=fontfile=${opts.fontFile}:textfile=${opts.titleFile}:expansion=none:` +
      `fontcolor=white:fontsize=56:line_spacing=10:x=80:y=${titleY}:` +
      `shadowcolor=black@0.6:shadowx=2:shadowy=2`
  )
  // Stichpunkte.
  parts.push(
    `drawtext=fontfile=${opts.fontFile}:textfile=${opts.bodyFile}:expansion=none:` +
      `fontcolor=0xE6ECFA:fontsize=33:line_spacing=22:x=92:y=${bodyY}:` +
      `shadowcolor=black@0.5:shadowx=1:shadowy=1`
  )
  // Fußzeile (Seitenzähler).
  parts.push(`drawtext=fontfile=${opts.fontFile}:textfile=${opts.footFile}:expansion=none:fontcolor=0x9AA4BF:fontsize=24:x=80:y=${SLIDE_HEIGHT - 56}`)

  return parts.join(",")
}

// Text einer Folie in die Textdateien schreiben und Titelzeilen-Anzahl liefern.
async function writeSlideText(dir: string, i: number, slideTitle: string, bullets: string[], total: number): Promise<number> {
  const titleLines = wrapText(slideTitle, 26).slice(0, 2)
  const titleText = titleLines.join("\n")

  // Pro Stichpunkt „•  " + max. 2 Umbruchzeilen (Folgezeilen eingerückt).
  const bodyLines: string[] = []
  for (const b of bullets.slice(0, 4)) {
    const wrapped = wrapText(b, 50).slice(0, 2)
    wrapped.forEach((line, idx) => bodyLines.push((idx === 0 ? "•  " : "     ") + line))
  }

  await writeFile(path.join(dir, `seg${i}_title.txt`), titleText, "utf8")
  await writeFile(path.join(dir, `seg${i}_body.txt`), bodyLines.join("\n"), "utf8")
  await writeFile(path.join(dir, `seg${i}_foot.txt`), `${i + 1} / ${total}`, "utf8")
  return titleLines.length
}

// Baut die MP4. Pro Segment ein Clip (Standbild + Vertonung, -shortest synct die
// Folie exakt auf die Narration), danach concat. 48 kHz Stereo für breite
// Player-Kompatibilität (24-kHz-Mono spielen manche Player tonlos ab).
export async function composeVideo(segments: RenderSegment[]): Promise<RenderResult> {
  if (segments.length === 0) throw new Error("Keine Segmente zum Rendern")
  const ffmpeg = await resolveFfmpeg()
  const dir = await mkdtemp(path.join(os.tmpdir(), "video-"))
  const run = (args: string[]) => execFileAsync(ffmpeg, args, { cwd: dir, maxBuffer: 64 * 1024 * 1024 })

  try {
    // Font einmalig in den Arbeitsordner schreiben (relativer Bezug aus dem cwd
    // vermeidet Windows-Pfad-Escaping in der Filterkette).
    await writeFile(path.join(dir, "font.ttf"), Buffer.from(NOTO_SANS_TTF_BASE64, "base64"))

    const segmentFiles: string[] = []
    let durationSeconds = 0

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      durationSeconds += wavDurationSeconds(seg.wav)

      const wavName = `seg${i}.wav`
      await writeFile(path.join(dir, wavName), seg.wav)

      const hasBg = Boolean(seg.background)
      const bgName = `seg${i}_bg.png`
      if (seg.background) await writeFile(path.join(dir, bgName), seg.background)

      const titleLines = await writeSlideText(dir, i, seg.slideTitle, seg.bullets, segments.length)

      const filter = buildSlideFilter({
        hasBackground: hasBg,
        bgName,
        titleFile: `seg${i}_title.txt`,
        bodyFile: `seg${i}_body.txt`,
        footFile: `seg${i}_foot.txt`,
        fontFile: "font.ttf",
        titleLines
      })

      const mp4Name = `seg${i}.mp4`
      const videoInput = hasBg ? ["-loop", "1", "-framerate", "2", "-i", bgName] : ["-f", "lavfi", "-i", `color=c=0x0b1020:s=${SLIDE_WIDTH}x${SLIDE_HEIGHT}:r=2`]

      await run([
        "-y",
        ...videoInput,
        "-i",
        wavName,
        "-vf",
        filter,
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-shortest",
        mp4Name
      ])
      segmentFiles.push(mp4Name)
    }

    // Segmente zusammenfügen (concat-Demuxer, relativ aus cwd).
    await writeFile(path.join(dir, "concat.txt"), segmentFiles.map((f) => `file '${f}'`).join("\n"), "utf8")
    await run(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "out.mp4"])

    const mp4 = await readFile(path.join(dir, "out.mp4"))
    return { mp4, durationSeconds: Math.round(durationSeconds) }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
