"use client"

import { useEffect, useState } from "react"
import "material-symbols/outlined.css"
import Markdown from "@/components/Markdown/Markdown"
import styles from "./ReportModal.module.scss"

type ReportViewModalProps = {
  notebookId: string
  reportId: string
  title: string
  onClose: () => void
}

export default function ReportViewModal({ notebookId, reportId, title, onClose }: ReportViewModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/reports/${reportId}`)
        if (!res.ok) throw new Error("Bericht konnte nicht geladen werden")
        const { report } = await res.json()
        if (!cancelled) setContent(report.content ?? "")
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [notebookId, reportId])

  async function copy() {
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className={styles.body}>
          {error && <p className={styles.error}>{error}</p>}
          {!content && !error && <p className={styles.loading}>Wird geladen…</p>}
          {content && <Markdown>{content}</Markdown>}
        </div>

        {content && (
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
