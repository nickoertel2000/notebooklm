import { and, desc, eq, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { notebooks, sources } from "@/db/schema"
import { isUuid } from "@/lib/uuid"

export async function getNotebookForUser(notebookId: string, userId: string) {
  if (!isUuid(notebookId)) return null
  const rows = await getDb()
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getNotebooksForUser(userId: string) {
  return getDb()
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
