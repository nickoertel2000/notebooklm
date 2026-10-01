import { NextRequest, NextResponse } from "next/server"
import { MAX_LENGTH, readJsonBody } from "@/lib/api/body"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { chatModels, generateText } from "@/lib/gemini"
import { SOURCES_ARE_DATA, wrapSources } from "@/lib/prompts"
import { consumeQuota } from "@/lib/quota"
import { SearchHit, SearchQuotaError, webSearch } from "@/lib/tavily"

type RouteContext = { params: Promise<{ notebookId: string }> }

export type DiscoverResult = { title: string; url: string; description: string }

const MAX_RESULTS = 8
const EXCERPT_LENGTH = 500

const SYSTEM_PROMPT = `Du wählst aus Suchtreffern die besten neuen Quellen zu einem Thema aus und beschreibst sie.
Gib AUSSCHLIESSLICH ein JSON-Array zurück – ohne weiteren Text, ohne Code-Fences – im Format:
[{"url": "https://…", "description": "Ein kurzer Satz auf Deutsch, worum es geht"}]
- Verwende nur URLs aus der Trefferliste, exakt wie angegeben.
- Höchstens ${MAX_RESULTS} möglichst unterschiedliche, seriöse und inhaltlich passende Treffer, die besten zuerst.
- Lass Werbung, reine Linksammlungen, Videos und Seiten ohne zusammenhängenden Text weg: Importiert wird der Text der Seite.
- description immer auf Deutsch, ein Satz.
${SOURCES_ARE_DATA}`

// Nur URLs aus den Treffern zulassen, damit keine von Gemini erfundenen Links durchkommen.
function pickResults(text: string, hits: SearchHit[]): DiscoverResult[] {
  const byUrl = new Map(hits.map((h) => [h.url, h]))
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((r) => {
      const hit = r && typeof r.url === "string" ? byUrl.get(r.url) : undefined
      return hit ? [{ title: hit.title.slice(0, 200), url: hit.url, description: String(r.description ?? "").slice(0, 300) }] : []
    })
  } catch {
    return []
  }
}

const fallbackResults = (hits: SearchHit[]): DiscoverResult[] =>
  hits.map((h) => ({ title: h.title.slice(0, 200), url: h.url, description: h.content.replace(/\s+/g, " ").slice(0, 200) }))

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const body = await readJsonBody(req)
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) return NextResponse.json({ error: "Suchbegriff fehlt" }, { status: 400 })
  if (query.length > MAX_LENGTH.query) return NextResponse.json({ error: "Der Suchbegriff ist zu lang" }, { status: 400 })

  const quotaError = await consumeQuota(auth.user.id, "discover")
  if (quotaError) return NextResponse.json({ error: quotaError }, { status: 429 })

  let hits: SearchHit[]
  try {
    hits = await webSearch(query, body.depth === "deep")
  } catch (err) {
    if (err instanceof SearchQuotaError) {
      return NextResponse.json(
        { error: "Das kostenlose Suchkontingent ist für diesen Monat aufgebraucht. Die übrigen Quellenarten funktionieren weiterhin." },
        { status: 503 }
      )
    }
    console.error("Websuche fehlgeschlagen:", err)
    return NextResponse.json({ error: "Die Websuche ist gerade nicht erreichbar. Bitte versuche es später erneut." }, { status: 502 })
  }
  if (hits.length === 0) return NextResponse.json({ results: [] })

  const list = hits.map((h, i) => `${i + 1}. ${h.title}\nURL: ${h.url}\nAuszug: ${h.content.replace(/\s+/g, " ").slice(0, EXCERPT_LENGTH)}`).join("\n\n")
  let results: DiscoverResult[] = []
  try {
    const text = await generateText({
      models: chatModels(),
      system: SYSTEM_PROMPT,
      prompt: `Thema: ${query}\n\nSuchtreffer:\n${wrapSources(list)}`,
      maxOutputTokens: 3000,
      minimalThinking: true
    })
    results = pickResults(text, hits)
  } catch (err) {
    console.error("Beschreibung der Suchtreffer fehlgeschlagen:", err)
  }

  return NextResponse.json({ results: (results.length > 0 ? results : fallbackResults(hits)).slice(0, MAX_RESULTS) })
}
