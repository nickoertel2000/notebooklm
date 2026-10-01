import { and, asc, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db"
import { sourceChunks, sources } from "@/db/schema"
import { wrapSources } from "@/lib/prompts"

const MAX_CONTEXT_CHARS = 150_000
// Chunks haben höchstens 3.200 Zeichen. Ohne Grenze lüde ein großes Notebook alle Chunks, obwohl nur 150.000 Zeichen genutzt werden.
const MAX_CONTEXT_CHUNKS = 500

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
    .limit(MAX_CONTEXT_CHUNKS)

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
  return wrapSources(context.trim())
}
