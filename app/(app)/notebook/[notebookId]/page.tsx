import { notFound, redirect } from "next/navigation"
import NotebookHeader from "@/components/NotebookHeader/NotebookHeader"
import { NotebookTitleProvider } from "@/components/NotebookHeader/NotebookTitleContext"
import { getDb } from "@/db"
import { getSessionUser } from "@/lib/auth/session"
import { listAudios, listMessages, listReports, listSources, listVideos } from "@/lib/notebookItems"
import { getNotebookForUser } from "@/lib/notebooks"
import NotebookView from "./NotebookView"

export default async function NotebookPage({ params }: { params: Promise<{ notebookId: string }> }) {
  const db = getDb()
  const { notebookId } = await params

  const user = await getSessionUser()
  if (!user) redirect("/login")

  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) notFound()

  const [sources, messages, reports, audios, videos] = await Promise.all([
    listSources(db, notebookId),
    listMessages(db, notebookId),
    listReports(db, notebookId),
    listAudios(db, notebookId),
    listVideos(db, notebookId)
  ])

  return (
    <NotebookTitleProvider initialTitle={notebook.title} initialEmoji={notebook.emoji}>
      <NotebookHeader notebookId={notebookId} user={user} />
      <NotebookView
        notebookId={notebookId}
        initialSources={sources}
        initialMessages={messages}
        initialReports={reports}
        initialAudios={audios}
        initialVideos={videos}
      />
    </NotebookTitleProvider>
  )
}
