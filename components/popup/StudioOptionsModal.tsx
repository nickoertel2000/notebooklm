"use client"

import { useState } from "react"
import "material-symbols"
import { AMOUNT_OPTIONS, DIFFICULTY_OPTIONS, StudioAmount, StudioDifficulty, StudioFormat, StudioOptions } from "@/lib/studio"
import styles from "./StudioOptionsModal.module.scss"
import Modal from "@/components/Modal/Modal"

type StudioOptionsModalProps = {
  format: StudioFormat
  onClose: () => void
  onCreate: (options: StudioOptions) => void
}

export default function StudioOptionsModal({ format, onClose, onCreate }: StudioOptionsModalProps) {
  const [amount, setAmount] = useState<StudioAmount>("standard")
  const [difficulty, setDifficulty] = useState<StudioDifficulty>("medium")
  const [focus, setFocus] = useState("")

  return (
    <Modal label={`${format.label} anpassen`} className={styles.modal} onClose={onClose}>
      <header className={styles.header}>
        <span className={`material-symbols-outlined ${styles.headerIcon}`}>{format.icon}</span>
        <h2 className={styles.title}>{format.label} anpassen</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div className={styles.body}>
        {format.hasAmount && (
          <div className={styles.row}>
            <div>
              <p className={styles.sectionLabel}>Anzahl</p>
              <div className={styles.toggle}>
                {AMOUNT_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.toggleBtn} ${amount === o.id ? styles.toggleBtnActive : ""}`}
                    onClick={() => setAmount(o.id)}
                  >
                    {amount === o.id && <span className="material-symbols-outlined">check</span>}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={styles.sectionLabel}>Schwierigkeitsgrad</p>
              <div className={styles.toggle}>
                {DIFFICULTY_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.toggleBtn} ${difficulty === o.id ? styles.toggleBtnActive : ""}`}
                    onClick={() => setDifficulty(o.id)}
                  >
                    {difficulty === o.id && <span className="material-symbols-outlined">check</span>}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className={styles.sectionLabel}>{format.focusLabel}</p>
        <textarea className={styles.focus} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={format.focusPlaceholder} rows={4} />
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.createBtn} onClick={() => onCreate({ amount, difficulty, focus })}>
          Erstellen
        </button>
      </footer>
    </Modal>
  )
}
