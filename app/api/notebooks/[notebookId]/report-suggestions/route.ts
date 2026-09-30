import { asc, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { chatModels, generateText } from "@/lib/gemini"
import { checkRateLimit } from "@/lib/quota"

export type ReportSuggestion = { title: string; description: string; prompt: string }

type RouteContext = { params: Promise<{ notebookId: string }> }

const SYSTEM_PROMPT = `Du schlägst konkrete, zum Inhalt passende Bericht-Formate für ein Notebook vor.
Gib AUSSCHLIESSLICH ein JSON-Array zurück – ohne weiteren Text, ohne Code-Fences – im Format:
[{"title": "Kurzer Titel", "description": "Ein kurzer Satz, was der Bericht enthält", "prompt": "Präzise Anweisung an die KI, was der Bericht abdecken soll"}]
- Genau 4 Vorschläge, möglichst unterschiedlich und spezifisch zum Inhalt.
- title: 1–3 Wörter. description: ein kurzer Satz auf Deutsch.
- prompt: konkrete, umsetzbare Anweisung (1–2 Sätze) auf Deutsch.`

function parseSuggestions(text: string): ReportSuggestion[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s.title === "string" && typeof s.prompt === "string")
      .map((s) => ({
        title: String(s.title).slice(0, 60),
        description: String(s.description ?? "").slice(0, 160),
        prompt: String(s.prompt).slice(0, 600)
      }))
      .slice(0, 4)
  } catch {
    return []
  }
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  const rateError = await checkRateLimit(auth.user.id)
  if (rateError) return NextResponse.json({ error: rateError }, { status: 429 })
  const db = getDb()

  const [sourceRows, chunkRows] = await Promise.all([
    db.select({ title: sources.title }).from(sources).where(eq(sources.notebookId, notebookId)).limit(20),
    db.select({ content: sourceChunks.content }).from(sourceChunks).where(eq(sourceChunks.notebookId, notebookId)).orderBy(asc(sourceChunks.createdAt)).limit(6)
  ])

  const titles = sourceRows.map((s) => `- ${s.title}`).join("\n")
  const excerpts = chunkRows.map((c) => c.content.slice(0, 500)).join("\n---\n")
  if (!titles && !excerpts) return NextResponse.json({ suggestions: [] })

  try {
    const text = await generateText({
      models: chatModels(),
      system: SYSTEM_PROMPT,
      prompt: `Quellen:\n${titles}\n\nAuszüge:\n${excerpts}`.slice(0, 6000),
      maxOutputTokens: 800
    })
    return NextResponse.json({ suggestions: parseSuggestions(text) })
  } catch (err) {
    console.error("Formatvorschläge fehlgeschlagen:", err)
    return NextResponse.json({ suggestions: [] })
  }
}
