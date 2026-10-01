import { redirect } from "next/navigation"
import "material-symbols"
import Header from "@/components/Header/Header"
import NotebookCard from "@/components/NotebookCard/NotebookCard"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebooksForUser } from "@/lib/notebooks"
import { MAX_NOTEBOOKS_PER_USER } from "@/lib/demoConfig"
import { createNotebook } from "./actions"
import "./notebook-home.scss"

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })

const HINWEISE = new Map([
  ["notebook-limit", `In dieser Demo sind höchstens ${MAX_NOTEBOOKS_PER_USER} Notebooks pro Konto möglich. Lösche ein Notebook, um ein neues anzulegen.`],
  ["rate-limit", "Zu viele Anfragen in kurzer Zeit. Bitte warte einen Moment."]
])

type HomeProps = { searchParams: Promise<{ hinweis?: string }> }

export default async function NotebookLMHome({ searchParams }: HomeProps) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [notebookList, { hinweis }] = await Promise.all([getNotebooksForUser(user.id), searchParams])
  const notice = hinweis ? HINWEISE.get(hinweis) : undefined

  return (
    <>
      <Header />
      <div className="nlm">
        <header className="nlm-topbar">
          <div className="nlm-actions">
            <form action={createNotebook} style={{ display: "contents" }}>
              <button type="submit" className="nlm-create-btn">
                <span className="material-symbols-outlined">add</span>
                Neu erstellen
              </button>
            </form>
          </div>
        </header>

        {notice && (
          <p className="nlm-notice" role="alert">
            {notice}
          </p>
        )}

        <h2 className="nlm-heading">Zuletzt geöffnete Notebooks</h2>
        <div className="nlm-grid">
          <form action={createNotebook} style={{ display: "contents" }}>
            <button type="submit" className="nlm-card create">
              <div className="nlm-create-circle">
                <span className="material-symbols-outlined">add</span>
              </div>
              <span className="nlm-create-label">Neues Notebook erstellen</span>
            </button>
          </form>

          {notebookList.map((nb) => (
            <NotebookCard
              key={nb.id}
              id={nb.id}
              title={nb.title}
              emoji={nb.emoji}
              meta={`${dateFormat.format(nb.updatedAt)} · ${nb.sourceCount} ${nb.sourceCount === 1 ? "Quelle" : "Quellen"}`}
            />
          ))}
        </div>
      </div>
    </>
  )
}
