"use client"

import WebSourceSearch from "@/components/WebSourceSearch/WebSourceSearch"
import type { JobStatus, SourceItem, SourceType } from "@/lib/items"
import { hostOf } from "@/lib/url"
import "material-symbols"
import Image from "next/image"
import { useState } from "react"
import styles from "../notebook.module.scss"
import type { useSources } from "./useSources"

const SOURCE_ICON: Record<SourceType, string> = { pdf: "picture_as_pdf", url: "link", text: "description" }

type SourcesPanelProps = {
  notebookId: string
  sources: ReturnType<typeof useSources>
  activeSourceId: string | null
  onActivate: (sourceId: string) => void
  onOpenAddDialog: () => void
}

export default function SourcesPanel({ notebookId, sources, activeSourceId, onActivate, onOpenAddDialog }: SourcesPanelProps) {
  return (
    <section className={`${styles.panel} ${styles.sources}`}>
      <header className={styles.panelHeader}>
        <h2>Quellen</h2>
      </header>

      <div className={styles.sourcesBody}>
        <button className={styles.addSource} onClick={onOpenAddDialog}>
          <span className="material-symbols-outlined">add</span>
          Quellen hinzufügen
        </button>

        <div className={styles.webSearch}>
          <WebSourceSearch notebookId={notebookId} onImport={sources.importUrls} />
        </div>

        {sources.sources.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={`material-symbols-outlined ${styles.emptyIcon}`}>description</span>
            <p className={styles.emptyTitle}>Gespeicherte Quellen werden hier angezeigt</p>
            <p className={styles.emptyText}>Klicke oben auf „Quellen hinzufügen“, um PDFs, Websites oder eigene Texte hinzuzufügen.</p>
          </div>
        ) : (
          <>
            <div className={styles.selectAllRow}>
              <button className={styles.selectAllRefresh} aria-label="Quellen aktualisieren" onClick={() => sources.refresh()}>
                <span className="material-symbols-outlined">refresh</span>
              </button>
              <span className={styles.selectAllLabel}>Alle auswählen</span>
              <button className={styles.checkbox} role="checkbox" aria-checked={sources.allSelected} aria-label="Alle auswählen" onClick={sources.toggleAll}>
                <span className="material-symbols-outlined">check</span>
              </button>
            </div>

            <ul className={styles.sourceList}>
              {sources.sources.map((s) => (
                <SourceRow
                  key={s.id}
                  source={s}
                  active={activeSourceId === s.id}
                  selected={sources.selectedIds.has(s.id)}
                  onActivate={() => onActivate(s.id)}
                  onToggle={() => sources.toggle(s.id)}
                  onRetry={() => sources.retry(s.id)}
                  onDelete={() => sources.remove(s.id)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

type SourceRowProps = {
  source: SourceItem
  active: boolean
  selected: boolean
  onActivate: () => void
  onToggle: () => void
  onRetry: () => void
  onDelete: () => void
}

function SourceRow({ source, active, selected, onActivate, onToggle, onRetry, onDelete }: SourceRowProps) {
  const link = source.type === "url" ? source.sourceUrl : null
  // Die Buttons liegen in der klickbaren Zeile und dürfen sie nicht mit auslösen.
  const only = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    action()
  }

  return (
    <li
      className={`${styles.sourceItem} ${active ? styles.sourceItemActive : ""}`}
      title={link ?? undefined}
      onClick={() => {
        onActivate()
        if (link) window.open(link, "_blank", "noopener,noreferrer")
      }}
    >
      <SourceIcon type={source.type} url={link} />
      <span className={styles.sourceTitle}>{source.title}</span>
      <SourceStatus status={source.status} error={source.error} />
      <button className={styles.sourceDelete} aria-label="Quelle löschen" onClick={only(onDelete)}>
        <span className="material-symbols-outlined">close</span>
      </button>
      {source.status === "failed" ? (
        <button className={styles.sourceRetry} aria-label={`Import von „${source.title}“ wiederholen`} title="Import wiederholen" onClick={only(onRetry)}>
          <span className="material-symbols-outlined">refresh</span>
        </button>
      ) : (
        <button className={styles.checkbox} role="checkbox" aria-checked={selected} aria-label={`Quelle „${source.title}“ auswählen`} onClick={only(onToggle)}>
          <span className="material-symbols-outlined">check</span>
        </button>
      )}
    </li>
  )
}

function SourceIcon({ type, url }: { type: SourceType; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const host = url ? hostOf(url) : null

  if (host && !failed) {
    return (
      <Image
        className={styles.sourceFavicon}
        src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
        alt=""
        width={20}
        height={20}
        unoptimized
        onError={() => setFailed(true)}
      />
    )
  }

  return <span className={`material-symbols-outlined ${styles.sourceIcon}`}>{SOURCE_ICON[type] ?? "description"}</span>
}

function SourceStatus({ status, error }: { status: JobStatus; error: string | null }) {
  if (status === "ready") return null
  if (status === "failed") {
    return (
      <span className={`material-symbols-outlined ${styles.statusFailed}`} title={error || "Verarbeitung fehlgeschlagen"}>
        error
      </span>
    )
  }
  return <span className={`material-symbols-outlined ${styles.statusProcessing}`}>progress_activity</span>
}
