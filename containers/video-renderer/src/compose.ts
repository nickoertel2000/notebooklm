import { execFile } from "node:child_process"
import { copyFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type RenderSlide = {
  title: string
  body: string
  footer: string
  titleLines: number
  // Dateiendung des Hintergrundbilds, null = einfarbig.
  background: "png" | "jpg" | "webp" | null
}

export type RenderManifest = {
  width: number
  height: number
  slides: RenderSlide[]
}

// Pfad zur Font-Datei im Image (siehe Dockerfile).
const FONT_FILE = path.resolve("font.ttf")

function buildSlideFilter(manifest: RenderManifest, slide: RenderSlide, i: number): string {
  const { width, height } = manifest
  const parts: string[] = []

  if (slide.background) {
    parts.push(`scale=${width}:${height}:force_original_aspect_ratio=increase`)
    parts.push(`crop=${width}:${height}`)
  }
  // Abdunkelnder Schleier, damit der Text unabhängig vom Bildmotiv lesbar bleibt.
  parts.push(`drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.42:t=fill`)

  const titleY = 120
  const bodyY = titleY + slide.titleLines * 66 + 44
  // textfile= + expansion=none statt text=: kein Escaping von Doppelpunkten, Anführungszeichen usw.
  const text = (file: string, style: string) => `drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:${style}`

  parts.push(text(`slide${i}_title.txt`, `fontcolor=white:fontsize=56:line_spacing=10:x=80:y=${titleY}:shadowcolor=black@0.6:shadowx=2:shadowy=2`))
  parts.push(text(`slide${i}_body.txt`, `fontcolor=0xE6ECFA:fontsize=33:line_spacing=22:x=92:y=${bodyY}:shadowcolor=black@0.5:shadowx=1:shadowy=1`))
  parts.push(text(`slide${i}_foot.txt`, `fontcolor=0x9AA4BF:fontsize=24:x=80:y=${height - 56}`))

  return parts.join(",")
}

// Erwartet die Eingaben bereits in dir: slide{i}.wav und ggf. slide{i}.{background}.
// Pro Folie ein Clip (Standbild + Vertonung, -shortest synchronisiert auf die Narration),
// danach verlustfreies concat. 48 kHz Stereo, weil manche Player 24-kHz-Mono stumm abspielen.
export async function composeVideo(dir: string, manifest: RenderManifest): Promise<string> {
  if (manifest.slides.length === 0) throw new Error("Keine Folien zum Rendern")

  const run = (args: string[]) => execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { cwd: dir, maxBuffer: 16 * 1024 * 1024 })
  await copyFile(FONT_FILE, path.join(dir, "font.ttf"))

  const clips: string[] = []
  for (const [i, slide] of manifest.slides.entries()) {
    await writeFile(path.join(dir, `slide${i}_title.txt`), slide.title, "utf8")
    await writeFile(path.join(dir, `slide${i}_body.txt`), slide.body, "utf8")
    await writeFile(path.join(dir, `slide${i}_foot.txt`), slide.footer, "utf8")

    const videoInput = slide.background
      ? ["-loop", "1", "-framerate", "2", "-i", `slide${i}.${slide.background}`]
      : ["-f", "lavfi", "-i", `color=c=0x0b1020:s=${manifest.width}x${manifest.height}:r=2`]

    const clip = `clip${i}.mp4`
    await run([
      "-y",
      ...videoInput,
      "-i",
      `slide${i}.wav`,
      "-vf",
      buildSlideFilter(manifest, slide, i),
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
      clip
    ])
    clips.push(clip)
  }

  await writeFile(path.join(dir, "concat.txt"), clips.map((c) => `file '${c}'`).join("\n"), "utf8")
  await run(["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", "out.mp4"])
  return path.join(dir, "out.mp4")
}
