import "material-symbols/outlined.css"
import "./notebook-home.scss"

export default function NotebookLMHome() {
  return (
    <div className="nlm">
      {/* Topbar */}
      <header className="nlm-topbar">
        <button className="nlm-chip">Alle</button>

        <div className="nlm-actions">
          <button className="nlm-icon-btn" aria-label="Suche">
            <span className="material-symbols-outlined">search</span>
          </button>

          <div className="nlm-toggle" role="group" aria-label="Ansicht">
            <button className="nlm-toggle-btn" aria-label="Auswählen">
              <span className="material-symbols-outlined">check</span>
            </button>
            <button className="nlm-toggle-btn active" aria-label="Rasteransicht" aria-pressed="true">
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button className="nlm-toggle-btn" aria-label="Listenansicht">
              <span className="material-symbols-outlined">list</span>
            </button>
          </div>

          <button className="nlm-dropdown">
            Neueste Projekte
            <span className="material-symbols-outlined">expand_more</span>
          </button>

          <button className="nlm-create-btn">
            <span className="material-symbols-outlined">add</span>
            Neu erstellen
          </button>
        </div>
      </header>

      {/* Inhalt */}
      <h2 className="nlm-heading">Zuletzt geöffnete Notebooks</h2>
      <div className="nlm-grid">
        {/* Neues Notebook */}
        <button className="nlm-card create">
          <div className="nlm-create-circle">
            <span className="material-symbols-outlined">add</span>
          </div>
          <span className="nlm-create-label">Neues Notebook erstellen</span>
        </button>

        {/* Test 1 */}
        <div className="nlm-card nb test1">
          <div className="nlm-card-top">
            <span className="nlm-emoji" role="img" aria-label="Notizbuch">
              📓
            </span>
            <button className="nlm-menu" aria-label="Mehr Optionen">
              <span className="material-symbols-outlined">more_vert</span>
            </button>
          </div>
          <div className="nlm-card-bottom">
            <h3 className="nlm-card-title">Test 1</h3>
            <span className="nlm-card-meta">06.06.2026 · 1 Quelle</span>
          </div>
        </div>

        {/* Unbenanntes Notebook */}
        <div className="nlm-card nb default">
          <div className="nlm-card-top">
            <span className="nlm-emoji" role="img" aria-label="Notizbuch">
              📔
            </span>
            <button className="nlm-menu" aria-label="Mehr Optionen">
              <span className="material-symbols-outlined">more_vert</span>
            </button>
          </div>
          <div className="nlm-card-bottom">
            <h3 className="nlm-card-title">Unbenanntes Notebook</h3>
            <span className="nlm-card-meta">06.06.2026 · 0 Quellen</span>
          </div>
        </div>
      </div>
    </div>
  )
}
