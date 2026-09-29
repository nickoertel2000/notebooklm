import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"

export async function extractFromUrl(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NotebookLM-Klon/1.0)" }
  })
  if (!res.ok) {
    throw new Error(`URL konnte nicht geladen werden (HTTP ${res.status})`)
  }

  const html = await res.text()
  const { document } = parseHTML(html)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const article = new Readability(document as any).parse()

  const title = article?.title?.trim() || new URL(url).hostname
  const text = article?.textContent?.trim() || ""
  return { title, text }
}
