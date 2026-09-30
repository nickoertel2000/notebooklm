import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import { parsePublicUrl } from "@/lib/url"

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5
// Die ganze Seite liegt als String im Speicher, Worker-Limit 128 MB.
const MAX_BYTES = 5 * 1024 * 1024

// Meldungen dieses Typs sind für Nutzer gedacht und dürfen an den Client.
export class ExtractError extends Error {}

// Weiterleitungen einzeln prüfen, sonst führt eine öffentliche URL per Redirect ins lokale Netz.
async function fetchPublic(url: URL): Promise<Response> {
  let current = url
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NotebookLM-Klon/1.0)" }
    })
    const location = res.headers.get("location")
    if (res.status < 300 || res.status >= 400 || !location) return res

    const next = parsePublicUrl(new URL(location, current).href)
    if (!next) throw new ExtractError("Die Seite leitet auf eine nicht erlaubte Adresse weiter")
    current = next
  }
  throw new ExtractError("Die Seite leitet zu oft weiter")
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new ExtractError("Die Seite ist größer als 5 MB")
    }
    parts.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function extractFromUrl(rawUrl: string): Promise<{ title: string; text: string; url: string }> {
  const url = parsePublicUrl(rawUrl)
  if (!url) throw new ExtractError("Bitte eine öffentliche http- oder https-Adresse angeben")

  let res: Response
  try {
    res = await fetchPublic(url)
  } catch (err) {
    if (err instanceof ExtractError) throw err
    throw new ExtractError("Die Seite hat nicht rechtzeitig geantwortet oder ist nicht erreichbar")
  }
  if (!res.ok) throw new ExtractError(`URL konnte nicht geladen werden (HTTP ${res.status})`)

  const contentType = res.headers.get("content-type") ?? ""
  if (contentType && !contentType.includes("html")) throw new ExtractError("Unter der Adresse liegt keine Webseite")

  const { document } = parseHTML(await readLimited(res))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const article = new Readability(document as any).parse()

  const text = article?.textContent?.trim() || ""
  if (!text) throw new ExtractError("Auf der Seite wurde kein lesbarer Text gefunden")
  return { title: article?.title?.trim() || url.hostname, text, url: url.href }
}
