import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { reports, sources } from "@/db/schema"
import { startReport } from "@/lib/jobs/start"
import { getReportType } from "@/lib/reports"
import { buildStudioInstruction, getAmount, getDifficulty, getStudioFormat } from "@/lib/studio"
import { optionalString, parseSourceIds, readJsonBody } from "@/lib/api/body"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"

const STALE_PROCESSING_MS = 10 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  await db
    .update(reports)
    .set({ status: "failed", error: "Zeitüberschreitung bei der Erstellung" })
    .where(and(eq(reports.notebookId, notebookId), eq(reports.status, "processing"), lt(reports.createdAt, new Date(Date.now() - STALE_PROCESSING_MS))))

  const rows = await db
    .select({
      id: reports.id,
      type: reports.type,
      title: reports.title,
      sourceCount: reports.sourceCount,
      status: reports.status,
      createdAt: reports.createdAt
    })
    .from(reports)
    .where(eq(reports.notebookId, notebookId))
    .orderBy(desc(reports.createdAt))

  return NextResponse.json({ reports: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)

  const studioFormat = getStudioFormat(body.format)
  const reportType = getReportType(String(body.type))
  const instruction = studioFormat
    ? buildStudioInstruction(studioFormat, {
        amount: getAmount(body.amount),
        difficulty: getDifficulty(body.difficulty),
        focus: optionalString(body.focus) ?? ""
      })
    : (reportType?.instruction ?? optionalString(body.instruction))
  if (!instruction) {
    return NextResponse.json({ error: "Unbekannter Bericht-Typ" }, { status: 400 })
  }

  const reportTypeId = studioFormat?.id ?? reportType?.id ?? "custom"
  const reportLabel = studioFormat?.label ?? reportType?.label ?? optionalString(body.title) ?? "Eigener Bericht"

  const selectedIds = parseSourceIds(body.sourceIds)

  const ready = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(eq(sources.notebookId, notebookId), eq(sources.status, "ready"), selectedIds && selectedIds.length > 0 ? inArray(sources.id, selectedIds) : undefined)
    )

  if (ready.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = ready.length

  const [created] = await db
    .insert(reports)
    .values({ notebookId, type: reportTypeId, title: reportLabel, sourceCount, status: "processing" })
    .returning({ id: reports.id, createdAt: reports.createdAt })

  try {
    await startReport({
      reportId: created.id,
      notebookId,
      instruction,
      reportLabel,
      language: optionalString(body.language) ?? undefined,
      format: studioFormat?.id,
      sourceIds: selectedIds
    })
  } catch (err) {
    console.error("Bericht-Workflow konnte nicht gestartet werden:", err)
    await db.update(reports).set({ status: "failed", error: "Erstellung konnte nicht gestartet werden" }).where(eq(reports.id, created.id))
    return NextResponse.json({ error: "Erstellung konnte nicht gestartet werden" }, { status: 500 })
  }

  return NextResponse.json(
    {
      report: {
        id: created.id,
        type: reportTypeId,
        title: reportLabel,
        sourceCount,
        status: "processing",
        createdAt: created.createdAt.toISOString()
      }
    },
    { status: 202 }
  )
}
