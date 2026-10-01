"use client"

import { useState } from "react"
import "material-symbols"
import { VideoFormat, VIDEO_FORMATS, VisualStyle, VISUAL_STYLES } from "@/lib/video"
import { DEFAULT_LANGUAGE, STUDIO_LANGUAGES, type StudioLanguage } from "@/lib/languages"
import styles from "./VideoModal.module.scss"
import Modal from "@/components/Modal/Modal"

export type VideoOptions = {
  format: VideoFormat
  language: StudioLanguage
  visualStyle: VisualStyle
  customStyle: string
  focus: string
}

type VideoModalProps = {
  onClose: () => void
  onCreate: (options: VideoOptions) => void
}

export default function VideoModal({ onClose, onCreate }: VideoModalProps) {
  const [formatId, setFormatId] = useState(VIDEO_FORMATS[0].id)
  const [language, setLanguage] = useState<StudioLanguage>(DEFAULT_LANGUAGE)
  const [styleId, setStyleId] = useState(VISUAL_STYLES[0].id)
  const [customStyle, setCustomStyle] = useState("")
  const [focus, setFocus] = useState("")

  function submit() {
    const format = VIDEO_FORMATS.find((f) => f.id === formatId)
    const visualStyle = VISUAL_STYLES.find((s) => s.id === styleId)
    if (!format || !visualStyle) return
    onCreate({ format, language, visualStyle, customStyle, focus })
  }

  return (
    <Modal label="Video-Zusammenfassung anpassen" className={styles.modal} onClose={onClose}>
      <header className={styles.header}>
        <span className={`material-symbols-outlined ${styles.headerIcon}`}>movie</span>
        <h2 className={styles.title}>Video-Zusammenfassung anpassen</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div className={styles.body}>
        <p className={styles.sectionLabel}>Format</p>
        <div className={styles.formatGrid}>
          {VIDEO_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`${styles.formatCard} ${formatId === f.id ? styles.formatCardActive : ""}`}
              onClick={() => setFormatId(f.id)}
            >
              <span className={styles.formatHead}>
                <span className={styles.formatLabel}>{f.label}</span>
                {formatId === f.id && <span className="material-symbols-outlined">check</span>}
              </span>
              <span className={styles.formatDesc}>{f.description}</span>
            </button>
          ))}
        </div>

        <p className={styles.sectionLabel}>Sprache auswählen</p>
        <select className={styles.select} value={language} onChange={(e) => setLanguage(e.target.value as StudioLanguage)}>
          {STUDIO_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <p className={`${styles.sectionLabel} ${styles.styleHeading}`}>Visuellen Stil auswählen</p>
        <div className={styles.styleGrid}>
          {VISUAL_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.styleCard} ${styleId === s.id ? styles.styleCardActive : ""}`}
              onClick={() => setStyleId(s.id)}
              title={s.label}
            >
              {styleId === s.id && <span className={`material-symbols-outlined ${styles.styleCheck}`}>check_circle</span>}
              <span className={`material-symbols-outlined ${styles.styleIcon}`}>{s.icon}</span>
              <span className={styles.styleLabel}>{s.label}</span>
            </button>
          ))}
        </div>

        {styleId === "custom" && (
          <input
            className={styles.customInput}
            type="text"
            value={customStyle}
            onChange={(e) => setCustomStyle(e.target.value)}
            placeholder="Visuellen Stil beschreiben, z. B. „minimalistische Aquarell-Illustrationen“"
          />
        )}

        <p className={styles.sectionLabel}>Worauf sollen sich die KI-Moderatoren konzentrieren?</p>
        <textarea
          className={styles.focus}
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={"Erkläre die fundamentale Bewertung kritisch und neutral aus Analystensicht."}
          rows={3}
        />
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.createBtn} onClick={submit}>
          Erstellen
        </button>
      </footer>
    </Modal>
  )
}
