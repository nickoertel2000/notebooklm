import { asc, desc, eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import NotebookHeader from "@/components/NotebookHeader/NotebookHeader"
import { db } from "@/db"
import { audioOverviews, messages, reports, sources } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import NotebookView from "./NotebookView"

export default async function NotebookPage({ params }: { params: Promise<{ notebookId: string }> }) {
  const { notebookId } = await params

  const user = await getSessionUser()
  if (!user) redirect("/login")

  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) notFound()

  const [sourceRows, messageRows, reportRows, audioRows] = await Promise.all([
    db
      .select({
        id: sources.id,
        type: sources.type,
        title: sources.title,
        status: sources.status,
        error: sources.error,
        createdAt: sources.createdAt
      })
      .from(sources)
      .where(eq(sources.notebookId, notebookId))
      .orderBy(asc(sources.createdAt)),
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        citations: messages.citations
      })
      .from(messages)
      .where(eq(messages.notebookId, notebookId))
      .orderBy(asc(messages.createdAt)),
    db
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
      .orderBy(desc(reports.createdAt)),
    db
      .select({
        id: audioOverviews.id,
        format: audioOverviews.format,
        title: audioOverviews.title,
        durationSeconds: audioOverviews.durationSeconds,
        sourceCount: audioOverviews.sourceCount,
        status: audioOverviews.status,
        createdAt: audioOverviews.createdAt
      })
      .from(audioOverviews)
      .where(eq(audioOverviews.notebookId, notebookId))
      .orderBy(desc(audioOverviews.createdAt))
  ])

  return (
    <>
      <NotebookHeader notebookId={notebookId} title={notebook.title} user={user} />
      <NotebookView
        notebookId={notebookId}
        title={notebook.title}
        initialSources={sourceRows.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))}
        initialMessages={messageRows}
        initialReports={reportRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        initialAudios={audioRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
      />
    </>
  )
}
