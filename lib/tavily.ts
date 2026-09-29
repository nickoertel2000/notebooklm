import { env } from "cloudflare:workers"

// Websuche über Tavily: Google-Search-Grounding hat im Gemini-Gratis-Tarif kein Kontingent.
const TAVILY_URL = "https://api.tavily.com/search"

// Importiert wird der Text einer Seite, Videoportale liefern keinen.
const EXCLUDED_DOMAINS = ["youtube.com", "youtu.be", "vimeo.com", "tiktok.com"]

export type SearchHit = { title: string; url: string; content: string }

// Gratis-Tarif (1.000 Credits pro Monat) aufgebraucht: Tavily antwortet mit 432.
export class SearchQuotaError extends Error {}

type TavilyResponse = { results?: { title?: string; url?: string; content?: string }[] }

// basic kostet 1 Credit, advanced 2.
export async function webSearch(query: string, deep: boolean): Promise<SearchHit[]> {
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, search_depth: deep ? "advanced" : "basic", max_results: deep ? 12 : 8, topic: "general", exclude_domains: EXCLUDED_DOMAINS })
  })

  if (res.status === 432 || res.status === 433) throw new SearchQuotaError("Tavily-Kontingent aufgebraucht")
  if (!res.ok) throw new Error(`Tavily ${res.status}`)

  const json = (await res.json()) as TavilyResponse
  return (json.results ?? []).flatMap((r) =>
    r.url && /^https?:\/\//.test(r.url) ? [{ title: r.title?.trim() || r.url, url: r.url, content: r.content ?? "" }] : []
  )
}
