import { NextRequest, NextResponse } from "next/server"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { chatModel, generateText } from "@/lib/gemini"
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
- description immer auf Deutsch, ein Satz.`

// Auswahl und deutsche Beschreibungen von Gemini. Nur URLs aus den Treffern zählen,
// damit keine erfundenen Links durchkommen.
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

// Ohne brauchbare Gemini-Antwort: Tavily-Reihenfolge, Auszug als Beschreibung.
const fallbackResults = (hits: SearchHit[]): DiscoverResult[] =>
  hits.map((h) => ({ title: h.title.slice(0, 200), url: h.url, description: h.content.replace(/\s+/g, " ").slice(0, 200) }))

// Im Web nach neuen Quellen suchen: Tavily liefert die Treffer, Gemini wählt aus und beschreibt.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const body = (await req.json()) as { query?: unknown; depth?: unknown }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) return NextResponse.json({ error: "Suchbegriff fehlt" }, { status: 400 })

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
      model: chatModel(),
      system: SYSTEM_PROMPT,
      prompt: `Thema: ${query}\n\nSuchtreffer:\n\n${list}`,
      maxOutputTokens: 3000,
      minimalThinking: true
    })
    results = pickResults(text, hits)
  } catch (err) {
    console.error("Beschreibung der Suchtreffer fehlgeschlagen:", err)
  }

  return NextResponse.json({ results: (results.length > 0 ? results : fallbackResults(hits)).slice(0, MAX_RESULTS) })
}
