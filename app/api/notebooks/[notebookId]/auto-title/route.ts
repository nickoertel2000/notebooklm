import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { messages, notebooks, sourceChunks, sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { chatModel, generateText } from "@/lib/gemini"
import { pickNotebookEmoji } from "@/lib/notebookIcons"
import { DEFAULT_NOTEBOOK_TITLE } from "@/lib/notebookTitle"
import { readJsonBody } from "@/lib/api/body"

type RouteContext = { params: Promise<{ notebookId: string }> }

const SYSTEM_PROMPT = `Du erzeugst einen kurzen, prägnanten Titel für ein Notebook auf Basis seines Inhalts.
- Antworte NUR mit dem Titel, ohne Anführungszeichen, ohne Punkt am Ende.
- 2 bis 6 Wörter, auf Deutsch.
- Beschreibe das übergreifende Thema, nicht eine einzelne Quelle.`

// Generiert aus den vorhandenen Quellen und Chat-Nachrichten automatisch einen
// Titel. Standardmäßig nur, wenn das Notebook noch den Standardtitel trägt –
// mit `{ force: true }` auch für bereits benannte Notebooks (manueller Neu-Vorschlag).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  const { notebook, user } = auth
  const db = getDb()

  const body = await readJsonBody(req)
  const force = body.force === true

  // Bereits benannt und kein erzwungener Neu-Vorschlag → nichts tun.
  if (!force && notebook.title !== DEFAULT_NOTEBOOK_TITLE) {
    return NextResponse.json({ title: notebook.title, generated: false })
  }

  // Kontext sammeln: Quellentitel, ein paar Textausschnitte, erste Nutzerfragen.
  const [sourceRows, chunkRows, userMessages] = await Promise.all([
    db.select({ title: sources.title }).from(sources).where(eq(sources.notebookId, notebookId)).limit(20),
    db.select({ content: sourceChunks.content }).from(sourceChunks).where(eq(sourceChunks.notebookId, notebookId)).orderBy(asc(sourceChunks.createdAt)).limit(3),
    db
      .select({ content: messages.content })
      .from(messages)
      .where(and(eq(messages.notebookId, notebookId), eq(messages.role, "user")))
      .orderBy(asc(messages.createdAt))
      .limit(5)
  ])

  const parts: string[] = []
  if (sourceRows.length > 0) {
    parts.push("Quellen:\n" + sourceRows.map((s) => `- ${s.title}`).join("\n"))
  }
  if (chunkRows.length > 0) {
    parts.push("Auszüge:\n" + chunkRows.map((c) => c.content.slice(0, 600)).join("\n---\n"))
  }
  if (userMessages.length > 0) {
    parts.push("Fragen des Nutzers:\n" + userMessages.map((m) => `- ${m.content}`).join("\n"))
  }

  // Keine Grundlage für einen Titel → Default beibehalten.
  if (parts.length === 0) {
    return NextResponse.json({ title: notebook.title, generated: false })
  }

  try {
    const raw = await generateText({
      model: chatModel(),
      system: SYSTEM_PROMPT,
      prompt: parts.join("\n\n").slice(0, 6000),
      maxOutputTokens: 200,
      minimalThinking: true
    })

    // Erste nichtleere Zeile, ohne Anführungszeichen/Umrandung.
    const title = (raw.split("\n").find((l) => l.trim()) ?? "")
      .replace(/^["'„“”]+|["'„“”.]+$/g, "")
      .trim()
      .slice(0, 100)

    if (!title) return NextResponse.json({ title: notebook.title, generated: false })

    // Passendes Icon aus der Bibliothek zum erzeugten Titel wählen.
    const emoji = await pickNotebookEmoji(title)

    // Ohne force nur überschreiben, wenn der Titel zwischenzeitlich nicht manuell
    // geändert wurde; mit force (manueller Neu-Vorschlag) immer.
    await db
      .update(notebooks)
      .set({ title, ...(emoji ? { emoji } : {}), updatedAt: new Date() })
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id), ...(force ? [] : [eq(notebooks.title, DEFAULT_NOTEBOOK_TITLE)])))

    revalidatePath("/")
    return NextResponse.json({ title, emoji, generated: true })
  } catch (err) {
    console.error("Auto-Titel fehlgeschlagen:", err)
    return NextResponse.json({ title: notebook.title, generated: false })
  }
}
