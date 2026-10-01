"use client"

import { useEffect, useRef, useState } from "react"
import WebSourceSearch from "@/components/WebSourceSearch/WebSourceSearch"
import styles from "./AddSourceModal.module.scss"
import { errorMessage } from "@/lib/api/client"

const ROTATING_WORDS = ["Deine Dokumente", "Websites", "Deine Notizen"] as const

const HOLD_DURATION = 3000
const EXIT_DURATION = 280 // muss zu $exit-duration in der SCSS passen

export type AddSourcePayload = { type: "pdf"; file: File } | { type: "url"; url: string } | { type: "text"; title?: string; text: string }

interface AddSourceModalProps {
  notebookId: string
  onClose?: () => void
  /** Wirft bei Fehler. */
  onAdd: (payload: AddSourcePayload) => Promise<void>
  onImportUrls: (urls: string[]) => Promise<void>
}

type Mode = "menu" | "url" | "text"

export default function AddSourceModal({ notebookId, onClose, onAdd, onImportUrls }: AddSourceModalProps) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<"enter" | "exit">("enter")
  const [mode, setMode] = useState<Mode>("menu")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase === "enter") {
      const hold = setTimeout(() => setPhase("exit"), HOLD_DURATION)
      return () => clearTimeout(hold)
    }
    const swap = setTimeout(() => {
      setIndex((i) => (i + 1) % ROTATING_WORDS.length)
      setPhase("enter")
    }, EXIT_DURATION)
    return () => clearTimeout(swap)
  }, [phase, index])

  async function run(payload: AddSourcePayload) {
    setBusy(true)
    setError(null)
    try {
      await onAdd(payload)
    } catch (err) {
      setError(errorMessage(err, "Die Quelle konnte nicht hinzugefügt werden."))
      setBusy(false)
    }
  }

  async function addPdf(file: File | undefined) {
    if (!file) return
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Es werden nur PDF-Dateien unterstützt.")
      return
    }
    await run({ type: "pdf", file })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (!busy) addPdf(e.dataTransfer.files[0])
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
          <span className={`material-symbols-outlined ${styles.icon} ${styles.iconClose}`} aria-hidden="true">
            close
          </span>
        </button>

        <h2 className={styles.title}>
          <span className={styles.rotatingLine}>
            <span key={index} className={`${styles.rotating} ${phase === "exit" ? styles.exit : styles.enter}`}>
              {ROTATING_WORDS[index]}
            </span>
          </span>
          in Audio- und Video-Zusammenfassungen umwandeln lassen
        </h2>

        {error && <p className={styles.modeError}>{error}</p>}

        <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={(e) => addPdf(e.target.files?.[0])} />

        {mode === "menu" && (
          <>
            <WebSourceSearch notebookId={notebookId} onImport={onImportUrls} variant="modal" />

            <div className={styles.buttonRow}>
              <button type="button" className={styles.sourceButton} disabled={busy} onClick={() => fileInputRef.current?.click()}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  upload
                </span>
                <span>PDF hochladen</span>
              </button>
              <button type="button" className={styles.sourceButton} disabled={busy} onClick={() => setMode("url")}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  link
                </span>
                <span>Website</span>
              </button>
              <button type="button" className={styles.sourceButton} disabled={busy} onClick={() => setMode("text")}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  content_paste
                </span>
                <span>Text einfügen</span>
              </button>
            </div>

            <div
              className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`}
              role="button"
              tabIndex={0}
              aria-disabled={busy}
              onClick={() => !busy && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !busy) {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={(e) => {
                // Auch beim Wechsel auf Icon oder Text gefeuert, nur beim echten Verlassen zurücksetzen.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
              }}
              onDrop={handleDrop}
            >
              <span className={`material-symbols-outlined ${styles.icon} ${styles.dropIcon}`} aria-hidden="true">
                upload
              </span>
              <p className={styles.dropText}>{busy ? "Wird hinzugefügt…" : "PDF-Dateien zum Hochladen per Drag-and-drop hierher ziehen oder klicken."}</p>
            </div>
          </>
        )}

        {mode === "url" && (
          <form
            className={styles.modeForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (url.trim()) run({ type: "url", url: url.trim() })
            }}
          >
            <input
              className={styles.modeInput}
              type="url"
              placeholder="https://example.com/artikel"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              required
            />
            <div className={styles.modeActions}>
              <button type="button" className={styles.modeBack} onClick={() => setMode("menu")} disabled={busy}>
                Zurück
              </button>
              <button type="submit" className={styles.modeSubmit} disabled={busy || !url.trim()}>
                {busy ? "Wird geladen…" : "Hinzufügen"}
              </button>
            </div>
          </form>
        )}

        {mode === "text" && (
          <form
            className={styles.modeForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) run({ type: "text", title: title.trim() || undefined, text })
            }}
          >
            <input className={styles.modeInput} type="text" placeholder="Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              className={styles.modeTextarea}
              placeholder="Text hier einfügen…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              autoFocus
              required
            />
            <div className={styles.modeActions}>
              <button type="button" className={styles.modeBack} onClick={() => setMode("menu")} disabled={busy}>
                Zurück
              </button>
              <button type="submit" className={styles.modeSubmit} disabled={busy || !text.trim()}>
                {busy ? "Wird verarbeitet…" : "Hinzufügen"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
