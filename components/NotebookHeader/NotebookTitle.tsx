"use client"

import { useLayoutEffect, useRef, useState } from "react"
import styles from "./notebookHeader.module.scss"
import { useNotebookTitle } from "./NotebookTitleContext"
import Toast from "@/components/Toast/Toast"
import { errorMessage, readError, readJson, UserError } from "@/lib/api/client"

const TITLE_ERROR = "Der Titel konnte nicht erzeugt werden."

type NotebookTitleProps = {
  notebookId: string
  onRename: (notebookId: string, title: string) => Promise<string | null | void>
}

export default function NotebookTitle({ notebookId, onRename }: NotebookTitleProps) {
  const { title, emoji, setTitle } = useNotebookTitle()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    const previous = title
    setTitle(next)
    try {
      const nextEmoji = await onRename(notebookId, next)
      if (typeof nextEmoji === "string" && nextEmoji) setTitle(next, nextEmoji)
    } catch {
      setTitle(previous)
      setDraft(previous)
    }
  }

  function cancel() {
    setDraft(title)
    setEditing(false)
  }

  async function generateTitle() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/auto-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      })
      if (!res.ok) throw new UserError(await readError(res, TITLE_ERROR))
      const data = await readJson<{ title?: string; emoji?: string | null; generated: boolean; reason?: "empty" }>(res)
      if (data.reason === "empty") throw new UserError("Für einen Titelvorschlag braucht das Notebook erst Quellen oder Fragen.")
      if (!data.generated || !data.title) throw new UserError(TITLE_ERROR)
      setTitle(data.title, data.emoji)
      setDraft(data.title)
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err, TITLE_ERROR))
    } finally {
      setGenerating(false)
    }
  }

  const toast = error && <Toast message={error} placement="top" onClose={() => setError(null)} />

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
        {toast}
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
      {toast}
    </>
  )
}
