"use client"

import { useEffect, useState } from "react"
import "material-symbols"
import { readError, readJson } from "@/lib/api/client"
import { hostOf } from "@/lib/url"
import styles from "./WebSourceSearch.module.scss"

type WebResult = { title: string; url: string; description: string }
type Depth = "quick" | "deep"

const DEPTH_OPTIONS: Record<Depth, { label: string; description: string; icon: string }> = {
  quick: { label: "Schnelle Recherche", description: "Ideal für schnelle Ergebnisse", icon: "travel_explore" },
  deep: { label: "Deep Research", description: "Gründlichere Suche und detaillierte Ergebnisse", icon: "network_intelligence" }
}

type Props = {
  notebookId: string
  // Wirft nicht, fehlgeschlagene URLs überspringt der Aufrufer.
  onImport: (urls: string[]) => Promise<void>
  variant?: "panel" | "modal"
}

export default function WebSourceSearch({ notebookId, onImport, variant = "panel" }: Props) {
  const isModal = variant === "modal"
  const [depth, setDepth] = useState<Depth>("quick")
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<WebResult[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [menuOpen])

  async function search() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, depth })
      })
      if (!res.ok) throw new Error(await readError(res, "Suche fehlgeschlagen"))
      const found = (await readJson<{ results?: WebResult[] }>(res)).results ?? []
      setResults(found)
      setSelected(new Set(found.map((r) => r.url)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  async function importSelected() {
    if (selected.size === 0 || importing) return
    setImporting(true)
    try {
      await onImport([...selected])
      setResults(null)
      setQuery("")
    } finally {
      setImporting(false)
    }
  }

  function chooseDepth(value: Depth) {
    setDepth(value)
    setMenuOpen(false)
  }

  return (
    <>
      <div className={`${styles.card} ${isModal ? styles.cardModal : ""}`}>
        <input
          className={styles.input}
          type="text"
          placeholder="Im Web nach neuen Quellen suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              search()
            }
          }}
          disabled={searching}
        />
        <div className={styles.row}>
          {isModal && (
            <span className={`${styles.chip} ${styles.chipStatic}`}>
              <span className="material-symbols-outlined">language</span>
              Web
            </span>
          )}
          <div className={styles.selectWrap} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.chip} onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="material-symbols-outlined">{DEPTH_OPTIONS[depth].icon}</span>
              {DEPTH_OPTIONS[depth].label}
              <span className="material-symbols-outlined">expand_more</span>
            </button>
            {menuOpen && (
              <div className={styles.menu} role="menu">
                {(Object.keys(DEPTH_OPTIONS) as Depth[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={depth === value}
                    className={`${styles.menuItem} ${depth === value ? styles.menuItemActive : ""}`}
                    onClick={() => chooseDepth(value)}
                  >
                    <span className="material-symbols-outlined">{DEPTH_OPTIONS[value].icon}</span>
                    <span className={styles.menuItemText}>
                      <span className={styles.menuItemLabel}>{DEPTH_OPTIONS[value].label}</span>
                      <span className={styles.menuItemDesc}>{DEPTH_OPTIONS[value].description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className={styles.submit} aria-label="Im Web suchen" onClick={search} disabled={searching || !query.trim()}>
            <span className="material-symbols-outlined">{isModal ? "arrow_forward" : "search"}</span>
          </button>
        </div>
      </div>

      {searching && (
        <div className={styles.loading}>
          <span className={`material-symbols-outlined ${styles.spinner}`}>progress_activity</span>
          Recherche auf Websites läuft…
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {results && !searching && (
        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.resultsEmpty}>Keine passenden Quellen gefunden.</p>
          ) : (
            <>
              <div className={styles.resultsHead}>
                <span>Gefundene Quellen</span>
                <button type="button" className={styles.resultsClose} aria-label="Ergebnisse schließen" onClick={() => setResults(null)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <ul className={styles.resultList}>
                {results.map((r) => {
                  const checked = selected.has(r.url)
                  return (
                    <li key={r.url} className={styles.resultItem} onClick={() => toggle(r.url)}>
                      <button
                        type="button"
                        className={styles.checkbox}
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`„${r.title}" auswählen`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(r.url)
                        }}
                      >
                        <span className="material-symbols-outlined">check</span>
                      </button>
                      <div className={styles.resultText}>
                        <p className={styles.resultTitle}>{r.title}</p>
                        {r.description && <p className={styles.resultDesc}>{r.description}</p>}
                        <a className={styles.resultUrl} href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                          {hostOf(r.url)}
                          <span className="material-symbols-outlined">open_in_new</span>
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className={styles.importBtn} onClick={importSelected} disabled={importing || selected.size === 0}>
                {importing ? "Wird importiert…" : `${selected.size} ${selected.size === 1 ? "Quelle" : "Quellen"} importieren`}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
