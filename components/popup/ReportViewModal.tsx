"use client"

import { useEffect, useState } from "react"
import "material-symbols"
import DataTableView, { tableToTsv } from "@/components/DataTableView/DataTableView"
import FlashcardsView from "@/components/FlashcardsView/FlashcardsView"
import Markdown from "@/components/Markdown/Markdown"
import MindmapView from "@/components/MindmapView/MindmapView"
import QuizView from "@/components/QuizView/QuizView"
import { getStudioFormat, parseStudioContent, StudioContent } from "@/lib/studio"
import styles from "./ReportModal.module.scss"
import { readJson } from "@/lib/api/client"

type ReportViewModalProps = {
  notebookId: string
  reportId: string
  title: string
  onClose: () => void
}

type Loaded = { kind: "markdown"; content: string } | { kind: "studio"; content: StudioContent }

export default function ReportViewModal({ notebookId, reportId, title, onClose }: ReportViewModalProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/reports/${reportId}`)
        if (!res.ok) throw new Error("Bericht konnte nicht geladen werden")
        const { report } = await readJson<{ report: { type: string; content: string | null } }>(res)
        const format = getStudioFormat(report.type)
        let next: Loaded
        if (format) {
          const content = parseStudioContent(format.id, report.content ?? "")
          if (!content) throw new Error("Inhalt konnte nicht gelesen werden")
          next = { kind: "studio", content }
        } else {
          next = { kind: "markdown", content: report.content ?? "" }
        }
        if (!cancelled) setLoaded(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [notebookId, reportId])

  const copyText = loaded?.kind === "markdown" ? loaded.content : loaded?.content.format === "table" ? tableToTsv(loaded.content.data) : null
  const wide = loaded?.kind === "studio" && (loaded.content.format === "table" || loaded.content.format === "mindmap")

  async function copy() {
    if (!copyText) return
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className={styles.body}>
          {error && <p className={styles.error}>{error}</p>}
          {!loaded && !error && <p className={styles.loading}>Wird geladen…</p>}
          {loaded?.kind === "markdown" && <Markdown>{loaded.content}</Markdown>}
          {loaded?.kind === "studio" && <StudioContentView content={loaded.content} />}
        </div>

        {copyText && (
          <footer className={styles.footer}>
            <button type="button" className={styles.copyBtn} onClick={copy}>
              <span className="material-symbols-outlined">{copied ? "check" : "content_copy"}</span>
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function StudioContentView({ content }: { content: StudioContent }) {
  switch (content.format) {
    case "flashcards":
      return <FlashcardsView data={content.data} />
    case "quiz":
      return <QuizView data={content.data} />
    case "table":
      return <DataTableView data={content.data} />
    case "mindmap":
      return <MindmapView data={content.data} />
  }
}
