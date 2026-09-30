import { redirect } from "next/navigation"
import "material-symbols"
import Header from "@/components/Header/Header"
import NotebookCard from "@/components/NotebookCard/NotebookCard"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebooksForUser } from "@/lib/notebooks"
import { createNotebook } from "./actions"
import "./notebook-home.scss"

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })

export default async function NotebookLMHome() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const notebookList = await getNotebooksForUser(user.id)

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
