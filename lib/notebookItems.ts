import { and, asc, desc, eq, lt, or, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import type { Db } from "@/db"
import { audioOverviews, messages, reports, sources, videoOverviews } from "@/db/schema"
import type { AudioItem, ChatMessage, JobStatus, ReportItem, SourceItem, VideoItem } from "@/lib/items"

// Stürzt ein Workflow ab oder startet nie, bliebe die Zeile für immer processing und der Client pollte
// endlos. Die Listen zeigen solche Zeilen als failed, ohne beim Lesen zu schreiben. Die Schwellen
// liegen über dem schlimmsten Fall inklusive Step-Retries. Quellen zählen ab updatedAt, weil jeder
// Embedding-Batch die Zeile anfasst.
const STALE_MINUTES = { source: 15, report: 10, audio: 15, video: 20 } as const

const olderThan = (column: AnyPgColumn, minutes: number) => lt(column, sql`now() - make_interval(mins => ${minutes}::int)`)

function stale(status: AnyPgColumn, since: AnyPgColumn, minutes: number): SQL {
  return and(eq(status, "processing"), olderThan(since, minutes))!
}

const shownStatus = (status: AnyPgColumn, since: AnyPgColumn, minutes: number) =>
  sql<JobStatus>`case when ${stale(status, since, minutes)} then 'failed' else ${status} end`

const iso = <T extends { createdAt: Date }>(row: T) => ({ ...row, createdAt: row.createdAt.toISOString() })

// Ein erneuter Import ist auch für eine hängende Quelle erlaubt, die die Liste schon als failed zeigt.
export const sourceRetryable = or(eq(sources.status, "failed"), stale(sources.status, sources.updatedAt, STALE_MINUTES.source))!

export async function listSources(db: Db, notebookId: string): Promise<SourceItem[]> {
  const isStale = stale(sources.status, sources.updatedAt, STALE_MINUTES.source)
  const rows = await db
    .select({
      id: sources.id,
      type: sources.type,
      title: sources.title,
      status: shownStatus(sources.status, sources.updatedAt, STALE_MINUTES.source),
      error: sql<string | null>`case when ${isStale} then 'Zeitüberschreitung beim Import' else ${sources.error} end`,
      sourceUrl: sources.sourceUrl,
      createdAt: sources.createdAt
    })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
    .orderBy(asc(sources.createdAt))
  return rows.map(iso)
}

export async function listMessages(db: Db, notebookId: string): Promise<ChatMessage[]> {
  return db
    .select({ id: messages.id, role: messages.role, content: messages.content, citations: messages.citations })
    .from(messages)
    .where(eq(messages.notebookId, notebookId))
    .orderBy(asc(messages.createdAt))
}

export async function listReports(db: Db, notebookId: string): Promise<ReportItem[]> {
  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      title: reports.title,
      sourceCount: reports.sourceCount,
      status: shownStatus(reports.status, reports.createdAt, STALE_MINUTES.report),
      createdAt: reports.createdAt
    })
    .from(reports)
    .where(eq(reports.notebookId, notebookId))
    .orderBy(desc(reports.createdAt))
  return rows.map(iso)
}

export async function listAudios(db: Db, notebookId: string): Promise<AudioItem[]> {
  const rows = await db
    .select({
      id: audioOverviews.id,
      format: audioOverviews.format,
      title: audioOverviews.title,
      durationSeconds: audioOverviews.durationSeconds,
      sourceCount: audioOverviews.sourceCount,
      status: shownStatus(audioOverviews.status, audioOverviews.createdAt, STALE_MINUTES.audio),
      createdAt: audioOverviews.createdAt
    })
    .from(audioOverviews)
    .where(eq(audioOverviews.notebookId, notebookId))
    .orderBy(desc(audioOverviews.createdAt))
  return rows.map(iso)
}

export async function listVideos(db: Db, notebookId: string): Promise<VideoItem[]> {
  const rows = await db
    .select({
      id: videoOverviews.id,
      format: videoOverviews.format,
      title: videoOverviews.title,
      visualStyle: videoOverviews.visualStyle,
      durationSeconds: videoOverviews.durationSeconds,
      sourceCount: videoOverviews.sourceCount,
      status: shownStatus(videoOverviews.status, videoOverviews.createdAt, STALE_MINUTES.video),
      createdAt: videoOverviews.createdAt
    })
    .from(videoOverviews)
    .where(eq(videoOverviews.notebookId, notebookId))
    .orderBy(desc(videoOverviews.createdAt))
  return rows.map(iso)
}
