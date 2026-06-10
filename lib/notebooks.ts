import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { notebooks, sources } from "@/db/schema"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string) {
  return UUID_RE.test(value)
}

// Liefert das Notebook nur, wenn es existiert UND dem User gehört — sonst null.
// Jeder notebook-gebundene Zugriff MUSS hierüber laufen.
export async function getNotebookForUser(notebookId: string, userId: string) {
  if (!isUuid(notebookId)) return null
  const rows = await db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

// Liefert alle Notebooks des Users inkl. Quellen-Anzahl, neueste zuerst.
export async function getNotebooksForUser(userId: string) {
  return db
    .select({
      id: notebooks.id,
      title: notebooks.title,
      emoji: notebooks.emoji,
      updatedAt: notebooks.updatedAt,
      sourceCount: sql<number>`count(${sources.id})`.mapWith(Number)
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .where(eq(notebooks.userId, userId))
    .groupBy(notebooks.id)
    .orderBy(desc(notebooks.updatedAt))
}
