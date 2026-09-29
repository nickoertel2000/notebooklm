import type { SlideBackground } from "@/lib/video"

export type SlideImage = { bytes: Uint8Array; format: Exclude<SlideBackground, null> }

// 16:9, ffmpeg skaliert im Container auf die Foliengröße.
const WIDTH = 1024
const HEIGHT = 576

// Das Ausgabeformat ist nicht dokumentiert, ffmpeg braucht aber die passende Endung.
function detectFormat(bytes: Uint8Array): SlideImage["format"] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg"
  if (String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "webp"
  return null
}

// FLUX.2 erwartet Multipart-Formdaten, auch wenn nur ein Prompt übergeben wird.
export async function generateSlideImage(ai: Ai, model: string, prompt: string): Promise<SlideImage> {
  const form = new FormData()
  form.append("prompt", prompt)
  form.append("width", String(WIDTH))
  form.append("height", String(HEIGHT))
  // Erst Response serialisiert FormData samt Boundary im Content-Type.
  const encoded = new Response(form)

  const result = (await ai.run(model as "@cf/black-forest-labs/flux-2-klein-4b", {
    multipart: { body: encoded.body ?? undefined, contentType: encoded.headers.get("content-type") ?? undefined }
  })) as { image?: string }
  if (!result.image) throw new Error("Workers AI lieferte kein Bild")

  const bytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0))
  const format = detectFormat(bytes)
  if (!format) throw new Error("Workers AI lieferte ein unbekanntes Bildformat")
  return { bytes, format }
}
