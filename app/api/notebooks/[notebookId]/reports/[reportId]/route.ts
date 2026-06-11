import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { reports } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string; reportId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Einzelnen Bericht inkl. content laden (für die Anzeige).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, reportId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.notebookId, notebookId)))
    .limit(1)

  if (!row) return NextResponse.json({ error: "Bericht nicht gefunden" }, { status: 404 })

  return NextResponse.json({ report: { ...row, createdAt: row.createdAt.toISOString() } })
}

// Bericht löschen.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { notebookId, reportId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  await db.delete(reports).where(and(eq(reports.id, reportId), eq(reports.notebookId, notebookId)))
  return NextResponse.json({ ok: true })
}
