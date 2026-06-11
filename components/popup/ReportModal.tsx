"use client"

import "material-symbols/outlined.css"
import { REPORT_TYPES, ReportType } from "@/lib/reports"
import styles from "./ReportModal.module.scss"

type ReportModalProps = {
  onClose: () => void
  onSelect: (type: ReportType) => void
}

export default function ReportModal({ onClose, onSelect }: ReportModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>Bericht erstellen</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className={styles.chooser}>
          <p className={styles.hint}>Wähle eine Bericht-Art. Sie wird aus deinen ausgewählten Quellen erzeugt.</p>
          <div className={styles.grid}>
            {REPORT_TYPES.map((type) => (
              <button key={type.id} type="button" className={styles.card} onClick={() => onSelect(type)}>
                <span className={`material-symbols-outlined ${styles.cardIcon}`}>{type.icon}</span>
                <span className={styles.cardLabel}>{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
