"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import styles from "./notebookHeader.module.scss"
import { readJson } from "@/lib/api/client"

type NotebookTitleProps = {
  notebookId: string
  initialTitle: string
  initialEmoji: string
  onRename: (notebookId: string, title: string) => Promise<string | null | void>
}

export default function NotebookTitle({ notebookId, initialTitle, initialEmoji, onRename }: NotebookTitleProps) {
  const [title, setTitle] = useState(initialTitle)
  const [emoji, setEmoji] = useState(initialEmoji)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const [generating, setGenerating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [prevInitial, setPrevInitial] = useState({ title: initialTitle, emoji: initialEmoji })
  if (initialTitle !== prevInitial.title || initialEmoji !== prevInitial.emoji) {
    setPrevInitial({ title: initialTitle, emoji: initialEmoji })
    if (initialTitle !== prevInitial.title) setTitle(initialTitle)
    if (initialEmoji !== prevInitial.emoji) setEmoji(initialEmoji)
  }

  // Auto-Titel (inkl. Icon) aus dem NotebookView (anderer Teilbaum) live übernehmen.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ title?: string; emoji?: string }>).detail
      if (detail?.title) {
        setTitle(detail.title)
        setDraft(detail.title)
      }
      if (detail?.emoji) setEmoji(detail.emoji)
    }
    window.addEventListener("notebook-title", handler)
    return () => window.removeEventListener("notebook-title", handler)
  }, [])

  // Beim Wechsel in den Edit-Modus den Text markieren.
  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEditing() {
    setDraft(title)
    setEditing(true)
  }

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === title) {
      setDraft(title)
      return
    }
    setTitle(next)
    try {
      // Der Rename wählt serverseitig ein passendes Icon und gibt es zurück.
      const nextEmoji = await onRename(notebookId, next)
      if (typeof nextEmoji === "string" && nextEmoji) setEmoji(nextEmoji)
    } catch {
      // Bei Fehler auf den alten Titel zurücksetzen.
      setTitle(title)
      setDraft(title)
    }
  }

  function cancel() {
    setDraft(title)
    setEditing(false)
  }

  // Wie bei neuen Notebooks: Claude erzeugt aus dem Inhalt einen Titel (inkl.
  // Icon) – hier per force auch, wenn das Notebook bereits einen Namen hat.
  async function generateTitle() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/auto-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      })
      if (!res.ok) return
      const data = await readJson<{ title?: string; emoji?: string | null; generated: boolean }>(res)
      if (data.generated && data.title) {
        setTitle(data.title)
        setDraft(data.title)
        if (data.emoji) setEmoji(data.emoji)
        setEditing(false)
      }
    } catch {
      // KI-Vorschlag ist optional – Fehler still ignorieren.
    } finally {
      setGenerating(false)
    }
  }

  if (editing) {
    return (
      <>
        <span className={styles.titleEditWrap}>
          <input
            ref={inputRef}
            className={`${styles.titleInput} ${styles.titleInputAi}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commit()
              } else if (e.key === "Escape") {
                e.preventDefault()
                cancel()
              }
            }}
            aria-label="Notebook-Name"
          />
          {/* mousedown-preventDefault: hält den Fokus, damit onBlur (commit) den
              Button nicht entfernt, bevor der Klick ausgelöst wird. */}
          <button
            type="button"
            className={styles.titleAiBtn}
            aria-label="Titel mit KI vorschlagen"
            title="Titel mit KI vorschlagen"
            onMouseDown={(e) => e.preventDefault()}
            onClick={generateTitle}
            disabled={generating}
          >
            <span className={`material-symbols-outlined ${generating ? styles.titleAiSpin : ""}`}>{generating ? "progress_activity" : "auto_awesome"}</span>
          </button>
        </span>
        <span className={styles.titleEmoji} role="img" aria-label="Notebook-Icon">
          {emoji}
        </span>
      </>
    )
  }

  return (
    <>
      <button type="button" className={styles.titleButton} onClick={startEditing}>
        {title}
      </button>
      <span className={styles.titleEmoji} role="img" aria-label="Notebook-Icon">
        {emoji}
      </span>
    </>
  )
}
