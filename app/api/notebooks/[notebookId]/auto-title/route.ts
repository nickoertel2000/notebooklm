import { and, asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { messages, notebooks, sourceChunks, sources } from "@/db/schema"
import { CHAT_MODEL, getAnthropic } from "@/lib/anthropic"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import { DEFAULT_NOTEBOOK_TITLE } from "@/lib/notebookTitle"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string }> }

const SYSTEM_PROMPT = `Du erzeugst einen kurzen, prägnanten Titel für ein Notebook auf Basis seines Inhalts.
- Antworte NUR mit dem Titel, ohne Anführungszeichen, ohne Punkt am Ende.
- 2 bis 6 Wörter, auf Deutsch.
- Beschreibe das übergreifende Thema, nicht eine einzelne Quelle.`

// Generiert – nur wenn das Notebook noch den Standardtitel trägt – aus den
// vorhandenen Quellen und Chat-Nachrichten automatisch einen Titel.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 })
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 })

  // Bereits benannt → nichts tun.
  if (notebook.title !== DEFAULT_NOTEBOOK_TITLE) {
    return NextResponse.json({ title: notebook.title, generated: false })
  }

  // Kontext sammeln: Quellentitel, ein paar Textausschnitte, erste Nutzerfragen.
  const [sourceRows, chunkRows, userMessages] = await Promise.all([
    db.select({ title: sources.title }).from(sources).where(eq(sources.notebookId, notebookId)).limit(20),
    db
      .select({ content: sourceChunks.content })
      .from(sourceChunks)
      .where(eq(sourceChunks.notebookId, notebookId))
      .orderBy(asc(sourceChunks.createdAt))
      .limit(3),
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
    const message = await getAnthropic().messages.create({
      model: CHAT_MODEL,
      max_tokens: 40,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts.join("\n\n").slice(0, 6000) }]
    })

    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()

    // Erste nichtleere Zeile, ohne Anführungszeichen/Umrandung.
    const title = (raw.split("\n").find((l) => l.trim()) ?? "")
      .replace(/^["'„“”]+|["'„“”.]+$/g, "")
      .trim()
      .slice(0, 100)

    if (!title) return NextResponse.json({ title: notebook.title, generated: false })

    // Nur überschreiben, wenn der Titel zwischenzeitlich nicht manuell geändert wurde.
    await db
      .update(notebooks)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id), eq(notebooks.title, DEFAULT_NOTEBOOK_TITLE)))

    revalidatePath("/")
    return NextResponse.json({ title, generated: true })
  } catch (err) {
    console.error("Auto-Titel fehlgeschlagen:", err)
    return NextResponse.json({ title: notebook.title, generated: false })
  }
}
