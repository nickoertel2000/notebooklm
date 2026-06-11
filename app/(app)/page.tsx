import { redirect } from "next/navigation"
import "material-symbols/outlined.css"
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
      {/* Topbar */}
      <header className="nlm-topbar">
        <button className="nlm-chip">Alle</button>

        <div className="nlm-actions">
          <button className="nlm-icon-btn" aria-label="Suche">
            <span className="material-symbols-outlined">search</span>
          </button>

          <div className="nlm-toggle" role="group" aria-label="Ansicht">
            <div className="nlm-toggle-group">
              <button className="nlm-toggle-btn active" aria-label="Auswählen" aria-pressed="true">
                <span className="material-symbols-outlined">check</span>
              </button>
              <button className="nlm-toggle-btn active" aria-label="Rasteransicht" aria-pressed="true">
                <span className="material-symbols-outlined">grid_view</span>
              </button>
            </div>
            <button className="nlm-toggle-btn" aria-label="Listenansicht">
              <span className="material-symbols-outlined">view_headline</span>
            </button>
          </div>

          <button className="nlm-dropdown">
            Neueste Projekte
            <span className="material-symbols-outlined">arrow_drop_down</span>
          </button>

          <form action={createNotebook} style={{ display: "contents" }}>
            <button type="submit" className="nlm-create-btn">
              <span className="material-symbols-outlined">add</span>
              Neu erstellen
            </button>
          </form>
        </div>
      </header>

      {/* Inhalt */}
      <h2 className="nlm-heading">Zuletzt geöffnete Notebooks</h2>
      <div className="nlm-grid">
        {/* Neues Notebook */}
        <form action={createNotebook} style={{ display: "contents" }}>
          <button type="submit" className="nlm-card create">
            <div className="nlm-create-circle">
              <span className="material-symbols-outlined">add</span>
            </div>
            <span className="nlm-create-label">Neues Notebook erstellen</span>
          </button>
        </form>

        {/* Notebooks aus der Datenbank */}
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
