import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { reports } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { cancelJob } from "@/lib/jobs/start"
import { isUuid } from "@/lib/uuid"

type RouteContext = { params: Promise<{ notebookId: string; reportId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, reportId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(reportId)) return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 })

  const [row] = await getDb()
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 })

  return NextResponse.json({ report: { ...row, createdAt: row.createdAt.toISOString() } })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, reportId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error
  if (!isUuid(reportId)) return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 })

  const [deleted] = await getDb()
    .delete(reports)
    .where(and(eq(reports.id, reportId), eq(reports.notebookId, notebookId)))
    .returning({ status: reports.status })
  if (!deleted) return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 })
  if (deleted.status === "processing") await cancelJob("report", reportId)

  return NextResponse.json({ ok: true })
}
