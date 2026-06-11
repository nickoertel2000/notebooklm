"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import styles from "./notebookHeader.module.scss"

type NotebookTitleProps = {
  notebookId: string
  initialTitle: string
  onRename: (notebookId: string, title: string) => Promise<void>
}

export default function NotebookTitle({ notebookId, initialTitle, onRename }: NotebookTitleProps) {
  const [title, setTitle] = useState(initialTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle])

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
      await onRename(notebookId, next)
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

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.titleInput}
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
    )
  }

  return (
    <button type="button" className={styles.titleButton} onClick={startEditing}>
      {title}
    </button>
  )
}
