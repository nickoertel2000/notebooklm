"use client"

import { useEffect, useState } from "react"
import "material-symbols"
import { REPORT_TYPES } from "@/lib/reports"
import styles from "./ReportModal.module.scss"

export type ReportGeneratePayload = {
  type?: string
  instruction?: string
  title?: string
  language?: string
}

type ReportSuggestion = { title: string; description: string; prompt: string }

type ReportModalProps = {
  notebookId: string
  sourceIds: string[]
  onClose: () => void
  onGenerate: (payload: ReportGeneratePayload) => void
}

const LANGUAGES = ["Deutsch (Standard)", "English", "Français", "Español", "Italiano"]

export default function ReportModal({ notebookId, sourceIds, onClose, onGenerate }: ReportModalProps) {
  const [mode, setMode] = useState<"select" | "custom">("select")
  const [suggestions, setSuggestions] = useState<ReportSuggestion[] | null>(null)
  const [language, setLanguage] = useState(LANGUAGES[0])
  const [customText, setCustomText] = useState("")

  // KI-Formatvorschläge beim Öffnen laden.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/report-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceIds })
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setSuggestions(data.suggestions ?? [])
      } catch {
        if (!cancelled) setSuggestions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [notebookId, sourceIds])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          {mode === "custom" && (
            <button type="button" className={styles.back} onClick={() => setMode("select")} aria-label="Zurück">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          )}
          <span className={`material-symbols-outlined ${styles.headerIcon}`}>post_add</span>
          <h2 className={styles.title}>Bericht erstellen</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {mode === "select" ? (
          <div className={styles.body}>
            <p className={styles.sectionTitle}>Format</p>
            <div className={styles.formatGrid}>
              <button type="button" className={styles.formatCard} onClick={() => setMode("custom")}>
                <span className={styles.formatCardTitle}>Eigenen Bericht erstellen</span>
                <span className={styles.formatCardDesc}>Berichte nach eigenen Vorstellungen erstellen und Angaben zu Aufbau, Stil, Ton machen</span>
              </button>
              {REPORT_TYPES.map((t) => (
                <button key={t.id} type="button" className={styles.formatCard} onClick={() => onGenerate({ type: t.id })}>
                  <span className={styles.formatCardTitle}>{t.label}</span>
                  <span className={styles.formatCardDesc}>{t.description}</span>
                </button>
              ))}
            </div>

            <p className={styles.sectionTitle}>
              <span className={`material-symbols-outlined ${styles.wand}`}>auto_awesome</span>
              Formatvorschläge
            </p>
            {suggestions === null ? (
              <div className={styles.formatGrid}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`${styles.formatCard} ${styles.formatCardSkeleton}`} aria-hidden="true" />
                ))}
              </div>
            ) : suggestions.length === 0 ? (
              <p className={styles.suggestHint}>Keine Vorschläge verfügbar – wähle ein Format oben oder erstelle einen eigenen Bericht.</p>
            ) : (
              <div className={styles.formatGrid}>
                {suggestions.map((s, i) => (
                  <button key={i} type="button" className={styles.formatCard} onClick={() => onGenerate({ instruction: s.prompt, title: s.title })}>
                    <span className={styles.formatCardTitle}>{s.title}</span>
                    <span className={styles.formatCardDesc}>{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.body}>
            <p className={styles.fieldLabel}>Sprache auswählen</p>
            <select className={styles.langSelect} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            <p className={styles.fieldLabel}>Beschreiben Sie den Bericht, der erstellt werden soll</p>
            <textarea
              className={styles.customArea}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={6}
              placeholder={
                "Beispiel:\n\nErstelle für ein neues Wellness-Getränk eine offizielle Wettbewerbsanalyse des Marktes für funktionelle Getränke 2026. Geh dabei analytisch und strategisch vor und konzentriere dich auf den Vertrieb und die Preisgestaltung der wichtigsten Mitbewerber."
              }
              autoFocus
            />

            <div className={styles.customFooter}>
              <button
                type="button"
                className={styles.generateBtn}
                disabled={!customText.trim()}
                onClick={() => onGenerate({ instruction: customText.trim(), language })}
              >
                Generieren
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
