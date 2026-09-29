import { and, asc, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db"
import { sourceChunks, sources } from "@/db/schema"

// Obergrenze für den Quellen-Kontext (~150k Zeichen ≈ ~45k Tokens).
const MAX_CONTEXT_CHARS = 150_000

// Berichte, Audio und Video nutzen keine Vektorsuche, sondern alle Chunks der
// ausgewählten fertigen Quellen in Reihenfolge – bis zum Zeichenbudget.
export async function buildContext(db: Db, notebookId: string, sourceIds: string[] | null): Promise<string> {
  const rows = await db
    .select({ sourceTitle: sources.title, content: sourceChunks.content })
    .from(sourceChunks)
    .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
    .where(
      and(
        eq(sourceChunks.notebookId, notebookId),
        eq(sources.status, "ready"),
        sourceIds && sourceIds.length > 0 ? inArray(sourceChunks.sourceId, sourceIds) : undefined
      )
    )
    .orderBy(asc(sources.title), asc(sourceChunks.idx))

  let context = ""
  let currentSource = ""
  for (const row of rows) {
    if (row.sourceTitle !== currentSource) {
      currentSource = row.sourceTitle
      context += `\n\n=== Quelle: ${row.sourceTitle} ===\n`
    }
    context += row.content + "\n"
    if (context.length >= MAX_CONTEXT_CHARS) break
  }
  return context.trim()
}
