"use client"

import { useState } from "react"
import styles from "./notebook.module.scss"
import "material-symbols/outlined.css"
import AddSourceModal from "@/components/popup/AddSourceModal"

type StudioTool = {
  label: string
  icon: string
  tint: string
  beta?: boolean
}

const studioTools: StudioTool[] = [
  { label: "Audio-Übersicht", icon: "graphic_eq", tint: "#8ab4f8" },
  { label: "Präsentation", icon: "co_present", tint: "#c58af9", beta: true },
  { label: "Videoübersicht", icon: "smart_display", tint: "#f28b82" },
  { label: "Mindmap", icon: "account_tree", tint: "#81c995" },
  { label: "Berichte", icon: "summarize", tint: "#fdd663" },
  { label: "Karteikarten", icon: "style", tint: "#78d9ec" },
  { label: "Quiz", icon: "quiz", tint: "#ff8bcb" },
  { label: "Infografik", icon: "insert_chart", tint: "#fbbc04", beta: true },
  { label: "Datentabelle", icon: "table_chart", tint: "#a7c0ff" }
]

const chatSuggestions = ["Informationen zu einem neuen Thema", "Etwas Neues erstellen", "Ein Projekt voranbringen"]

export default function NotebookPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <div className={styles.columns}>
        {/* ───────────── Quellen ───────────── */}
        <section className={`${styles.panel} ${styles.sources}`}>
          <header className={styles.panelHeader}>
            <h2>Quellen</h2>
            <button className={styles.iconButton} aria-label="Panel ein-/ausklappen">
              <span className="material-symbols-outlined">left_panel_close</span>
            </button>
          </header>

          <div className={styles.sourcesBody}>
            <button className={styles.addSource} onClick={() => setModalOpen(true)}>
              <span className="material-symbols-outlined">add</span>
              Quellen hinzufügen
            </button>

            <div className={styles.searchCard}>
              <span className={styles.searchCardLabel}>Im Web nach neuen Quellen suchen</span>
              <div className={styles.searchRow}>
                <button className={styles.chip}>
                  <span className="material-symbols-outlined">language</span>
                  Web
                  <span className="material-symbols-outlined">expand_more</span>
                </button>
                <button className={styles.chip}>
                  <span className="material-symbols-outlined">manage_search</span>
                  Schnelle Recherche
                  <span className="material-symbols-outlined">expand_more</span>
                </button>
                <button className={styles.searchSubmit} aria-label="Suchen">
                  <span className="material-symbols-outlined">search</span>
                </button>
              </div>
            </div>

            <div className={styles.emptyState}>
              <span className={`material-symbols-outlined ${styles.emptyIcon}`}>description</span>
              <p className={styles.emptyTitle}>Gespeicherte Quellen werden hier angezeigt</p>
              <p className={styles.emptyText}>
                Klicken Sie oben auf „Quelle hinzufügen“, um PDFs, Websites, Text, Videos oder Audiodateien hinzuzufügen. Sie können auch eine Datei direkt aus Google Drive importieren.
              </p>
            </div>
          </div>
        </section>

        {/* ───────────── Chat ───────────── */}
        <section className={`${styles.panel} ${styles.chat}`}>
          <header className={styles.panelHeader}>
            <h2>Chat</h2>
            <button className={styles.iconButton} aria-label="Weitere Optionen">
              <span className="material-symbols-outlined">more_vert</span>
            </button>
          </header>

          <div className={styles.chatBody}>
            <span className={styles.wave} role="img" aria-label="Winkende Hand">
              👋
            </span>
            <h1 className={styles.chatTitle}>Lass uns dein Notebook einrichten…</h1>
            <p className={styles.chatLead}>
              Dies ist ein leerer Canvas, auf dem du Neues lernen, Inhalte erstellen und deine Projekte voranbringen kannst. Gerne helfe ich dir beim Einstieg, du kannst aber auch direkt deine eigenen
              Quellen hinzufügen.
            </p>

            <p className={styles.chatPrompt}>Was ist der Zweck dieses Notebooks?</p>

            <div className={styles.suggestions}>
              {chatSuggestions.map((text) => (
                <button key={text} className={styles.suggestion}>
                  {text}
                </button>
              ))}
            </div>
          </div>

          <footer className={styles.chatFooter}>
            <div className={styles.composer}>
              <input className={styles.composerInput} type="text" placeholder="Frage stellen oder etwas erstellen" />
              <span className={styles.sourceCount}>0 Quellen</span>
              <button className={styles.sendButton} aria-label="Senden">
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </footer>
        </section>

        {/* ───────────── Studio ───────────── */}
        <section className={`${styles.panel} ${styles.studio}`}>
          <header className={styles.panelHeader}>
            <h2>Studio</h2>
            <button className={styles.iconButton} aria-label="Panel ein-/ausklappen">
              <span className="material-symbols-outlined">right_panel_close</span>
            </button>
          </header>

          <div className={styles.studioBody}>
            <div className={styles.studioGrid}>
              {studioTools.map((tool) => (
                <button key={tool.label} className={styles.studioCard} style={{ "--tint": tool.tint } as React.CSSProperties}>
                  <span className={`material-symbols-outlined ${styles.studioCardIcon}`}>{tool.icon}</span>
                  <span className={styles.studioCardLabel} style={{ color: tool.tint }}>
                    {tool.label}
                  </span>
                  {tool.beta && <span className={styles.beta}>BETA</span>}
                  <span className={`material-symbols-outlined ${styles.studioCardChevron}`}>chevron_right</span>
                </button>
              ))}
            </div>

            <div className={styles.emptyState}>
              <span className={`material-symbols-outlined ${styles.emptyIcon}`}>auto_awesome</span>
              <p className={styles.emptyTitle}>Hier wird die Ausgabe von Studio gespeichert.</p>
              <p className={styles.emptyText}>Nachdem Sie Quellen hinzufügen, klicken Sie, um Audio-Zusammenfassungen, Arbeitshilfen, Mindmaps und mehr hinzuzufügen.</p>
            </div>
          </div>

          <button className={styles.addNote}>
            <span className="material-symbols-outlined">note_add</span>
            Notiz hinzufügen
          </button>
        </section>
      </div>

      <p className={styles.disclaimer}>NotebookLM kann Fehler machen, überprüfen Sie daher die Antworten.</p>

      {modalOpen && <AddSourceModal onClose={() => setModalOpen(false)} />}
    </div>
  )
}
