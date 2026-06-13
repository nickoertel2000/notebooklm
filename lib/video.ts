// Video-Übersicht (NotebookLM-Stil): KEIN echtes KI-Video, sondern eine vertonte
// Slideshow. Pipeline (siehe amplify/functions/ingest/handler.ts → processVideoJob):
//   1. Claude erzeugt aus den Quellen ein strukturiertes Skript (Folien + Narration).
//   2. Gemini TTS vertont jede Narration einzeln (lib/gemini.ts → synthesizeSpeech).
//   3. Gemini 2.5 Flash Image („Nano Banana") malt pro Folie einen Hintergrund
//      (lib/gemini.ts → generateImage) im gewählten visuellen Stil.
//   4. ffmpeg brennt Titel + Stichpunkte per drawtext darüber und fügt alle
//      Segmente zur MP4 zusammen (lib/videoRender.ts).
//
// Diese Datei ist bewusst frei von Node-Abhängigkeiten, damit sie auch in den
// API-Routen (Edge-/Node-Runtime) importiert werden kann. Die ffmpeg-/Dateiseite
// liegt in lib/videoRender.ts.

// ───────────────────────── Formate ─────────────────────────
// Entspricht den zwei Karten im Popup („Erklärvideo" / „Zusammenfassung").

export type VideoFormat = {
  id: string
  label: string
  description: string
  // Steuert Folienanzahl + Länge der Narration je Folie.
  depth: "kurz" | "standard"
  // Beschreibt Claude, welche Art Skript es erzeugen soll.
  instruction: string
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: "explainer",
    label: "Erklärvideo",
    description: "Eine strukturierte, umfassende Übersicht, in der Zusammenhänge innerhalb Ihrer Quellen aufgezeigt werden.",
    depth: "standard",
    instruction:
      "Erzeuge eine strukturierte, umfassende Erklär-Übersicht. Baue die Folien logisch aufeinander auf, zeige Zusammenhänge zwischen den Quellen und erkläre Fachbegriffe verständlich."
  },
  {
    id: "summary",
    label: "Zusammenfassung",
    description: "Eine kurze Übersicht, mit der Sie die wichtigsten Informationen aus Ihren Quellen schnell erfassen können.",
    depth: "kurz",
    instruction:
      "Erzeuge eine kompakte Zusammenfassung der wichtigsten Informationen. Bring die Kernpunkte klar und in sinnvoller Reihenfolge auf den Punkt, ohne Nebenschauplätze."
  }
]

export function getVideoFormat(id: string): VideoFormat | undefined {
  return VIDEO_FORMATS.find((f) => f.id === id)
}

// ───────────────────────── Visuelle Stile ─────────────────────────
// Entspricht der Stil-Reihe im Popup. Genau diese fünf passen ohne horizontales
// Scrollen ins Modal (Vorgabe). `imageStyle` fließt in den Nano-Banana-Prompt ein;
// `custom` nimmt stattdessen den Freitext des Nutzers.

export type VisualStyle = {
  id: string
  label: string
  icon: string
  // Stil-Fragment für den Bild-Prompt (leer bei custom → Freitext).
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

// ───────────────────────── Skript (Claude) ─────────────────────────

export type VideoSegment = {
  // Folien-Überschrift (kurz, plakativ).
  slideTitle: string
  // Stichpunkte auf der Folie (werden visuell gezeigt, nicht vorgelesen).
  bullets: string[]
  // Sprechtext für diese Folie (Gemini TTS).
  narration: string
  // Kurzer Bildmotiv-Hinweis (englisch) für die Hintergrund-Illustration.
  imageHint: string
}

export type VideoScript = {
  title: string
  segments: VideoSegment[]
}

const SEGMENT_HINT: Record<VideoFormat["depth"], string> = {
  kurz: "Erzeuge 3–4 Folien. Jede Narration ca. 40–70 Wörter (etwa 20–30 Sekunden).",
  standard: "Erzeuge 5–7 Folien. Jede Narration ca. 70–110 Wörter (etwa 30–45 Sekunden)."
}

// System-Prompt für die Skript-Erzeugung. Fordert striktes JSON (Slide-Struktur).
// `language` ist der Anzeigename der Sprache (z. B. „Deutsch").
export function buildVideoScriptSystemPrompt(format: VideoFormat, language: string, focus: string | null): string {
  const focusLine = focus ? `\n- Lege den Fokus besonders auf: ${focus}` : ""
  return `Du erstellst das Skript für eine vertonte Video-Übersicht (Slideshow) eines Notebooks, ausschließlich auf Basis der bereitgestellten Quellen.

- Stütze dich ausschließlich auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Wenn die Quellen zu wenig hergeben, sage das offen in der Narration.
- Schreibe ALLE Texte (Titel, Folien, Narration) in folgender Sprache: ${language}.
- ${format.instruction}
- ${SEGMENT_HINT[format.depth]}${focusLine}

Pro Folie:
- "slideTitle": kurze, plakative Folien-Überschrift (max. ~6 Wörter), KEIN Markdown.
- "bullets": 2–4 sehr knappe Stichpunkte (je max. ~7 Wörter), KEIN Markdown, kein Satzzeichen am Ende. Werden auf der Folie ANGEZEIGT.
- "narration": natürlicher, gesprochener Fließtext für eine einzelne Erzählstimme. KEIN Markdown, keine Aufzählungszeichen. Erklärt die Folie, liest die Stichpunkte aber nicht wörtlich vor.
- "imageHint": ein KURZER englischer Bildmotiv-Hinweis (3–8 Wörter) für eine passende Hintergrund-Illustration, OHNE Text/Wörter im Bild (z. B. "rocket launching over stock charts").

Antworte AUSSCHLIESSLICH mit gültigem JSON in exakt dieser Form, ohne Code-Fences, ohne erklärenden Text davor oder danach:
{"title":"<Gesamttitel der Video-Übersicht>","segments":[{"slideTitle":"...","bullets":["...","..."],"narration":"...","imageHint":"..."}]}`
}

// Parst die JSON-Antwort robust: entfernt evtl. Code-Fences und schneidet auf das
// äußerste {...}-Objekt zu, falls das Modell doch Text drumherum schreibt.
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

  if (segments.length === 0) throw new Error("Video-Skript enthielt keine vertonbaren Segmente")

  return {
    title:
      String(obj.title ?? "Video-Übersicht")
        .trim()
        .slice(0, 120) || "Video-Übersicht",
    segments
  }
}

// ───────────────────────── Bild-Prompt (Nano Banana) ─────────────────────────

// Baut den Prompt für die Hintergrund-Illustration einer Folie. `customStyle`
// greift nur bei visualStyle === "custom". Wir verbieten explizit Text im Bild,
// weil Titel/Stichpunkte sauber per ffmpeg-drawtext darübergelegt werden.
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

// 16:9 in 720p (gerade Maße für libx264).
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

// Bricht Text grob auf eine maximale Zeichenzahl je Zeile um (an Wortgrenzen).
// Wird sowohl für die Titel- als auch die Stichpunkt-Umbrüche genutzt.
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
