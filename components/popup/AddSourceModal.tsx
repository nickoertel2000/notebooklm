"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./AddSourceModal.module.scss"

const ROTATING_WORDS = ["Ihre Dokumente", "Websites", "Ihre Notizen"] as const

const HOLD_DURATION = 3000 // ms sichtbar
const EXIT_DURATION = 280 // ms (muss zur SCSS-Keyframe-Dauer passen)

export type AddSourcePayload =
  | { type: "pdf"; file: File }
  | { type: "url"; url: string }
  | { type: "text"; title?: string; text: string }

interface AddSourceModalProps {
  /** Wird beim Klick auf das X bzw. den Overlay-Hintergrund aufgerufen. */
  onClose?: () => void
  /** Legt eine neue Quelle an. Wirft bei Fehler. */
  onAdd: (payload: AddSourcePayload) => Promise<void>
}

type Mode = "menu" | "url" | "text"

export default function AddSourceModal({ onClose, onAdd }: AddSourceModalProps) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<"enter" | "exit">("enter")
  const [mode, setMode] = useState<Mode>("menu")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await run({ type: "pdf", file })
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
          <span key={index} className={`${styles.rotating} ${phase === "exit" ? styles.exit : styles.enter}`}>
            {ROTATING_WORDS[index]}
          </span>{" "}
          als Wissensquelle für deinen Chat hinzufügen
        </h2>

        {error && <p className={styles.modeError}>{error}</p>}

        {mode === "menu" && (
          <div className={styles.uploadZone}>
            <p className={styles.uploadHeadline}>Wähle eine Quelle</p>
            <p className={styles.uploadHint}>PDF, Website-Link oder eingefügter Text</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={handleFile}
            />

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

            {busy && <p className={styles.uploadHint}>Wird hinzugefügt…</p>}
          </div>
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
            <input
              className={styles.modeInput}
              type="text"
              placeholder="Titel (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
