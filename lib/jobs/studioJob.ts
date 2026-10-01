import { and, eq, inArray } from "drizzle-orm"
import { NextResponse } from "next/server"
import type { Db } from "@/db"
import { sources } from "@/db/schema"
import { parseSourceIds } from "@/lib/api/body"
import { consumeQuota } from "@/lib/quota"

const START_ERROR = "Erstellung konnte nicht gestartet werden"

type StudioJob<Row> = {
  db: Db
  userId: string
  notebookId: string
  sourceIds: unknown
  // Für das Log, z. B. "Audio".
  label: string
  // Legt die Zeile mit status "processing" an.
  insert: (sourceCount: number) => Promise<Row>
  start: (row: Row, selectedIds: string[] | null) => Promise<unknown>
  markFailed: (row: Row, error: string) => Promise<unknown>
}

// Gemeinsamer Ablauf von Bericht, Audio und Video nach der Validierung: fertige Quellen prüfen,
// Kontingent buchen, Zeile anlegen, Workflow starten. Liefert die Zeile oder eine fertige Fehlerantwort.
export async function createStudioJob<Row>(job: StudioJob<Row>): Promise<{ row: Row } | { error: NextResponse }> {
  const selectedIds = parseSourceIds(job.sourceIds)
  const ready = await job.db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.notebookId, job.notebookId), eq(sources.status, "ready"), selectedIds ? inArray(sources.id, selectedIds) : undefined))
  if (ready.length === 0) return { error: NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 }) }

  const quotaError = await consumeQuota(job.userId, "studio")
  if (quotaError) return { error: NextResponse.json({ error: quotaError }, { status: 429 }) }

  const row = await job.insert(ready.length)
  try {
    await job.start(row, selectedIds)
  } catch (err) {
    console.error(`${job.label}-Workflow konnte nicht gestartet werden:`, err)
    await job.markFailed(row, START_ERROR)
    return { error: NextResponse.json({ error: START_ERROR }, { status: 500 }) }
  }
  return { row }
}
