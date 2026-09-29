"use client"

import { deleteNotebook, renameNotebook } from "@/app/(app)/actions"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import styles from "./NotebookCard.module.scss"

type Props = {
  id: string
  title: string
  emoji: string
  meta: string
}

export default function NotebookCard({ id, title, emoji, meta }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<"delete" | "edit" | null>(null)
  const [newTitle, setNewTitle] = useState(title)
  const [pending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [menuOpen])

  function handleDelete() {
    startTransition(async () => {
      await deleteNotebook(id)
      setDialog(null)
    })
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    startTransition(async () => {
      await renameNotebook(id, newTitle)
      setDialog(null)
    })
  }

  return (
    <div className={styles.cell}>
      <Link href={`/notebook/${id}`} className="nlm-card nb">
        <div className="nlm-card-top">
          <span className="nlm-emoji" role="img" aria-label="Notizbuch">
            {emoji}
          </span>
        </div>
        <div className="nlm-card-bottom">
          <h3 className="nlm-card-title">{title}</h3>
          <span className="nlm-card-meta">{meta}</span>
        </div>
      </Link>

      {/* Außerhalb des Links, weil Buttons in <a> nicht erlaubt sind. */}
      <div className={styles.menuWrap} ref={menuRef}>
        <button type="button" className="nlm-menu" aria-label="Mehr Optionen" onClick={() => setMenuOpen((o) => !o)}>
          <span className="material-symbols-outlined">more_vert</span>
        </button>

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                setDialog("delete")
              }}
            >
              <span className="material-symbols-outlined">delete</span>
              Löschen
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setNewTitle(title)
                setMenuOpen(false)
                setDialog("edit")
              }}
            >
              <span className="material-symbols-outlined">edit</span>
              Titel bearbeiten
            </button>
          </div>
        )}
      </div>

      {dialog === "delete" && (
        <div className={styles.overlay} onClick={() => !pending && setDialog(null)}>
          <div className={styles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.dialogTitle}>Notebook überall löschen?</h2>
            <p className={styles.dialogText}>
              Das Notebook „{emoji} {title}“ wird endgültig von allen Speicherorten gelöscht. Die Inhalte des Notebooks werden gelöscht.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setDialog(null)} disabled={pending}>
                Abbrechen
              </button>
              <button type="button" className={styles.btnDanger} onClick={handleDelete} disabled={pending}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog === "edit" && (
        <div className={styles.overlay} onClick={() => !pending && setDialog(null)}>
          <form className={styles.dialog} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} onSubmit={handleRename}>
            <h2 className={styles.dialogTitle}>Notebook bearbeiten</h2>

            <div className={styles.editEmoji}>
              <span role="img" aria-label="Notizbuch">
                {emoji}
              </span>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Notebook-Titel*</span>
              <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus required />
            </label>

            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setDialog(null)} disabled={pending}>
                Abbrechen
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={pending || !newTitle.trim()}>
                {pending ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
