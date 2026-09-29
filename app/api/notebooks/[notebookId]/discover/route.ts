import { NextRequest, NextResponse } from "next/server"
import { getAnthropic, reportModel } from "@/lib/anthropic"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"

type RouteContext = { params: Promise<{ notebookId: string }> }

export type DiscoverResult = { title: string; url: string; description: string }

// Erstes JSON-Array aus einem Text herausziehen und parsen.
function extractResults(text: string): DiscoverResult[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r) => r && typeof r.url === "string" && /^https?:\/\//.test(r.url))
      .map((r) => ({
        title: String(r.title ?? r.url).slice(0, 200),
        url: String(r.url),
        description: String(r.description ?? "").slice(0, 300)
      }))
      .slice(0, 10)
  } catch {
    return []
  }
}

// Im Web nach neuen Quellen suchen – via Claude mit dem web_search-Server-Tool.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const body = (await req.json()) as { query?: unknown; depth?: unknown }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) return NextResponse.json({ error: "Suchbegriff fehlt" }, { status: 400 })

  // Tiefe steuert, wie viele Suchanfragen Claude maximal stellen darf.
  const maxUses = body.depth === "deep" ? 8 : 3

  const tool: Record<string, unknown> = { type: "web_search_20250305", name: "web_search", max_uses: maxUses }

  const system = `Du hilfst Nutzern, neue, seriöse Web-Quellen zu einem Thema zu finden. Nutze die Websuche, um relevante Webseiten zu recherchieren.
Gib am Ende AUSSCHLIESSLICH ein JSON-Array zurück – ohne weiteren Text, ohne Code-Fences – im Format:
[{"title": "Titel der Seite", "url": "https://…", "description": "Ein kurzer Satz auf Deutsch, worum es geht"}]
- Nur echte URLs aus den Suchergebnissen, keine erfundenen.
- Höchstens 8 möglichst unterschiedliche, hochwertige Treffer.
- description immer auf Deutsch.`

  try {
    const message = await getAnthropic().messages.create({
      model: reportModel(),
      max_tokens: 2500,
      system,
      tools: [tool],
      messages: [{ role: "user", content: `Finde neue Web-Quellen zum Thema: ${query}.` }]
    } as unknown as Parameters<ReturnType<typeof getAnthropic>["messages"]["create"]>[0])

    const text = "content" in message ? message.content.map((b) => (b.type === "text" ? b.text : "")).join("") : ""

    return NextResponse.json({ results: extractResults(text) })
  } catch (err) {
    console.error("Websuche fehlgeschlagen:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
