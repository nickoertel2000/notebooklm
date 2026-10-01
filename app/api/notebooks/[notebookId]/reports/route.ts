import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { reports } from "@/db/schema"
import { startReport } from "@/lib/jobs/start"
import { createStudioJob } from "@/lib/jobs/studioJob"
import { parseLanguage } from "@/lib/languages"
import { listReports } from "@/lib/notebookItems"
import { getReportType } from "@/lib/reports"
import { buildStudioInstruction, getAmount, getDifficulty, getStudioFormat } from "@/lib/studio"
import { lengthError, MAX_LENGTH, optionalString, readJsonBody } from "@/lib/api/body"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  return NextResponse.json({ reports: await listReports(getDb(), notebookId) })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)
  const tooLong = lengthError([
    [body.instruction, MAX_LENGTH.instruction],
    [body.title, MAX_LENGTH.title],
    [body.focus, MAX_LENGTH.focus]
  ])
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 })

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
  const language = parseLanguage(body.language)

  const job = await createStudioJob({
    db,
    userId: auth.user.id,
    notebookId,
    sourceIds: body.sourceIds,
    label: "Bericht",
    insert: async (sourceCount) => {
      const [row] = await db.insert(reports).values({ notebookId, type: reportTypeId, title: reportLabel, sourceCount, status: "processing" }).returning({
        id: reports.id,
        type: reports.type,
        title: reports.title,
        sourceCount: reports.sourceCount,
        status: reports.status,
        createdAt: reports.createdAt
      })
      return row
    },
    start: (row, sourceIds) => startReport({ reportId: row.id, notebookId, instruction, reportLabel, language, format: studioFormat?.id, sourceIds }),
    markFailed: (row, error) => db.update(reports).set({ status: "failed", error }).where(eq(reports.id, row.id))
  })
  if ("error" in job) return job.error

  return NextResponse.json({ report: { ...job.row, createdAt: job.row.createdAt.toISOString() } }, { status: 202 })
}
