import { SOURCES_ARE_DATA } from "./prompts"

// ───────────────────────── Formate ─────────────────────────

export type VideoFormat = {
  id: string
  label: string
  description: string
  instruction: string
}

// Nur kurze Videos: Jede Folie kostet eine TTS-Anfrage, und deren Tageskontingent
// ist knapp (siehe jobs-worker.md).
export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "summary",
    label: "Zusammenfassung",
    description: "Eine kurze Übersicht, mit der Sie die wichtigsten Informationen aus Ihren Quellen schnell erfassen können.",
    instruction:
      "Erzeuge eine kompakte Zusammenfassung der wichtigsten Informationen. Bring die Kernpunkte klar und in sinnvoller Reihenfolge auf den Punkt, ohne Nebenschauplätze."
  }
]

export function getVideoFormat(id: string): VideoFormat | undefined {
  return VIDEO_FORMATS.find((f) => f.id === id)
}

// ───────────────────────── Visuelle Stile ─────────────────────────
// Mehr als fünf Stile passen nicht ohne horizontales Scrollen ins Modal.

export type VisualStyle = {
  id: string
  label: string
  icon: string
  imageStyle: string
}

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: "auto",
    label: "Automatische Auswahl",
    icon: "auto_awesome",
    imageStyle: "a clean, modern, professional editorial illustration with a muted, harmonious color palette, soft depth and subtle lighting"
  },
  {
    id: "custom",
    label: "Benutzerdefiniert",
    icon: "edit",
    imageStyle: ""
  },
  {
    id: "classic",
    label: "Klassisch",
    icon: "image",
    imageStyle: "a clean corporate presentation illustration, flat design, soft gradients, restrained professional color palette"
  },
  {
    id: "whiteboard",
    label: "Whiteboard",
    icon: "draw",
    imageStyle: "a hand-drawn black marker sketch on a white whiteboard, simple diagrammatic doodles, minimal, high contrast"
  },
  {
    id: "kawaii",
    label: "Kawaii",
    icon: "favorite",
    imageStyle: "a cute kawaii illustration, soft pastel colors, rounded friendly shapes, charming and playful"
  }
]

export function getVisualStyle(id: string): VisualStyle | undefined {
  return VISUAL_STYLES.find((s) => s.id === id)
}

// ───────────────────────── Skript ─────────────────────────

// Die Tagesgrenze für Folienbilder rechnet mit diesem Wert.
export const MAX_SLIDES = 4

// Dateiendung des Folienbilds im Render-Manifest, null = einfarbiger Hintergrund.
export type SlideBackground = "png" | "jpg" | "webp" | null

export type VideoSegment = {
  slideTitle: string
  bullets: string[]
  narration: string
  imageHint: string
}

export type VideoScript = {
  title: string
  segments: VideoSegment[]
}

const SEGMENT_HINT = `Erzeuge 3–${MAX_SLIDES} Folien. Jede Narration ca. 40–70 Wörter (etwa 20–30 Sekunden).`

export function buildVideoScriptSystemPrompt(format: VideoFormat, language: string, focus: string | null): string {
  const focusLine = focus ? `\n- Lege den Fokus besonders auf: ${focus}` : ""
  return `Du erstellst das Skript für eine vertonte Video-Übersicht (Slideshow) eines Notebooks, ausschließlich auf Basis der bereitgestellten Quellen.

- Stütze dich ausschließlich auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Wenn die Quellen zu wenig hergeben, sage das offen in der Narration.
${SOURCES_ARE_DATA}
- Schreibe ALLE Texte (Titel, Folien, Narration) in folgender Sprache: ${language}.
- ${format.instruction}
- ${SEGMENT_HINT}${focusLine}

Pro Folie:
- "slideTitle": kurze, plakative Folien-Überschrift (max. ~6 Wörter), KEIN Markdown.
- "bullets": 2–4 sehr knappe Stichpunkte (je max. ~7 Wörter), KEIN Markdown, kein Satzzeichen am Ende. Werden auf der Folie ANGEZEIGT.
- "narration": natürlicher, gesprochener Fließtext für eine einzelne Erzählstimme. KEIN Markdown, keine Aufzählungszeichen. Erklärt die Folie, liest die Stichpunkte aber nicht wörtlich vor.
- "imageHint": ein KURZER englischer Bildmotiv-Hinweis (3–15 Wörter) für eine passende Hintergrund-Illustration, OHNE Text/Wörter im Bild (z. B. "rocket launching over stock charts"). Geht es um ein reales, bekanntes Objekt (Bauwerk, Fahrzeug, Instrument, Lebewesen), nenne es beim Namen und beschreibe sein typisches Aussehen konkret (Form, Farben, Materialien) statt eines allgemeinen Begriffs, z. B. "James Webb Space Telescope, golden hexagonal segmented mirror, large silver five-layer sunshield" statt "space telescope".

Antworte AUSSCHLIESSLICH mit gültigem JSON in exakt dieser Form, ohne Code-Fences, ohne erklärenden Text davor oder danach:
{"title":"<Gesamttitel der Video-Übersicht>","segments":[{"slideTitle":"...","bullets":["...","..."],"narration":"...","imageHint":"..."}]}`
}

// Das Modell schreibt trotz Anweisung manchmal Code-Fences oder Text um das JSON.
export function parseVideoScript(raw: string): VideoScript {
  let text = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fence) text = fence[1].trim()
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first !== -1 && last !== -1 && last > first) text = text.slice(first, last + 1)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Video-Skript war kein gültiges JSON")
  }

  const obj = parsed as Partial<VideoScript>
  if (!obj || !Array.isArray(obj.segments) || obj.segments.length === 0) {
    throw new Error("Video-Skript enthielt keine Segmente")
  }

  const segments: VideoSegment[] = obj.segments
    .map((s) => ({
      slideTitle: String(s?.slideTitle ?? "").trim(),
      bullets: Array.isArray(s?.bullets)
        ? s.bullets
            .map((b) => String(b).trim())
            .filter(Boolean)
            .slice(0, 4)
        : [],
      narration: String(s?.narration ?? "").trim(),
      imageHint: String(s?.imageHint ?? "").trim()
    }))
    .filter((s) => s.narration.length > 0)
    .slice(0, MAX_SLIDES)

  if (segments.length === 0) throw new Error("Video-Skript enthielt keine vertonbaren Segmente")

  return {
    title:
      String(obj.title ?? "Video-Übersicht")
        .trim()
        .slice(0, 120) || "Video-Übersicht",
    segments
  }
}

// ───────────────────────── Bild-Prompt ─────────────────────────

// Kein Text im Bild: Titel und Stichpunkte legt der Renderer per drawtext darüber.
export function buildSlideImagePrompt(style: VisualStyle, customStyle: string | null, segment: VideoSegment): string {
  const styleFragment = style.id === "custom" && customStyle ? customStyle : style.imageStyle
  const motif = segment.imageHint || segment.slideTitle
  return [
    `A 16:9 landscape background illustration for a presentation slide about: ${motif}.`,
    `Visual style: ${styleFragment}.`,
    "Composition leaves the left and bottom area calm and uncluttered so overlaid text stays readable.",
    "Absolutely no text, no words, no letters, no numbers, no captions, no logos in the image."
  ].join(" ")
}

// ───────────────────────── Layout-Helfer ─────────────────────────

// libx264 braucht gerade Maße.
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) {
      lines.push(line)
      line = w
    } else {
      line = line ? line + " " + w : w
    }
  }
  if (line) lines.push(line)
  return lines
}

export type SlideLayout = {
  title: string
  body: string
  footer: string
  titleLines: number
}

export function layoutSlide(segment: VideoSegment, index: number, total: number): SlideLayout {
  const titleLines = wrapText(segment.slideTitle, 26).slice(0, 2)

  const bodyLines: string[] = []
  for (const bullet of segment.bullets.slice(0, 4)) {
    wrapText(bullet, 50)
      .slice(0, 2)
      .forEach((line, i) => bodyLines.push((i === 0 ? "•  " : "     ") + line))
  }

  return {
    title: titleLines.join("\n"),
    body: bodyLines.join("\n"),
    footer: `${index + 1} / ${total}`,
    titleLines: titleLines.length
  }
}
