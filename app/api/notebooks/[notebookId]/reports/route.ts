import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { reports, sources } from "@/db/schema"
import { getReportType } from "@/lib/reports"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import { putText } from "@/lib/s3"

export const runtime = "nodejs"

// Berichte, die länger als das hier in 'processing' hängen, gelten als
// abgebrochen und werden beim Auflisten auf 'failed' gesetzt — sonst pollt das
// Studio-Panel endlos.
const STALE_PROCESSING_MS = 5 * 60 * 1000

type RouteContext = { params: Promise<{ notebookId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Persistierte Berichte des Notebooks auflisten (ohne content) – fürs Studio-Panel.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  // Hängengebliebene 'processing'-Berichte aufräumen, bevor wir auflisten.
  await db
    .update(reports)
    .set({ status: "failed", error: "Zeitüberschreitung bei der Erstellung" })
    .where(
      and(
        eq(reports.notebookId, notebookId),
        eq(reports.status, "processing"),
        lt(reports.createdAt, new Date(Date.now() - STALE_PROCESSING_MS))
      )
    )

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

// Bericht erstellen: 'processing'-Zeile anlegen und einen Job nach S3 schreiben.
// Die eigentliche (lange) Generierung übernimmt der ingest-Worker; das Frontend
// pollt den Status. So umgehen wir das 30s-Timeout des SSR-Runtime.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const { type, sourceIds, instruction: customInstruction, title: customTitle, language } = await req.json()

  // Entweder ein bekannter Typ ODER eine freie Anweisung (Eigener Bericht /
  // KI-Formatvorschlag).
  const reportType = getReportType(type)
  const freeInstruction = typeof customInstruction === "string" ? customInstruction.trim() : ""
  if (!reportType && !freeInstruction) {
    return NextResponse.json({ error: "Unbekannter Bericht-Typ" }, { status: 400 })
  }

  const instruction = reportType ? reportType.instruction : freeInstruction
  const reportTypeId = reportType ? reportType.id : "custom"
  const reportLabel = reportType
    ? reportType.label
    : typeof customTitle === "string" && customTitle.trim()
      ? customTitle.trim()
      : "Eigener Bericht"

  const selectedIds: string[] | null = Array.isArray(sourceIds) ? sourceIds.filter((id) => typeof id === "string") : null

  // Sicherstellen, dass es überhaupt fertige Quellen gibt (schnelle Prüfung).
  const ready = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.status, "ready"),
        selectedIds && selectedIds.length > 0 ? inArray(sources.id, selectedIds) : undefined
      )
    )

  if (ready.length === 0) {
    return NextResponse.json({ error: "Keine fertigen Quellen ausgewählt" }, { status: 400 })
  }

  const sourceCount = ready.length

  const [created] = await db
    .insert(reports)
    .values({ notebookId, type: reportTypeId, title: reportLabel, sourceCount, status: "processing" })
    .returning({ id: reports.id, createdAt: reports.createdAt })

  // Job-Datei nach S3 schreiben → triggert den ingest-Worker.
  const jobKey = `notebooks/${notebookId}/jobs/report/${created.id}.json`
  await putText(
    jobKey,
    JSON.stringify({
      kind: "report",
      reportId: created.id,
      notebookId,
      instruction,
      reportLabel,
      language: typeof language === "string" ? language : undefined,
      sourceIds: selectedIds
    })
  )

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
