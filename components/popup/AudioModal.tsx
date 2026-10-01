"use client"

import { useState } from "react"
import "material-symbols"
import { AudioFormat, AudioLength, AUDIO_FORMATS } from "@/lib/audio"
import { DEFAULT_LANGUAGE, STUDIO_LANGUAGES, type StudioLanguage } from "@/lib/languages"
import styles from "./AudioModal.module.scss"

export type AudioOptions = {
  format: AudioFormat
  length: AudioLength
  language: StudioLanguage
  focus: string
}

type AudioModalProps = {
  onClose: () => void
  onCreate: (options: AudioOptions) => void
}

export default function AudioModal({ onClose, onCreate }: AudioModalProps) {
  const [formatId, setFormatId] = useState(AUDIO_FORMATS[0].id)
  const [length, setLength] = useState<AudioLength>("standard")
  const [language, setLanguage] = useState<StudioLanguage>(DEFAULT_LANGUAGE)
  const [focus, setFocus] = useState("")

  function submit() {
    const format = AUDIO_FORMATS.find((f) => f.id === formatId)
    if (!format) return
    onCreate({ format, length, language, focus })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={`material-symbols-outlined ${styles.headerIcon}`}>graphic_eq</span>
          <h2 className={styles.title}>Audio-Zusammenfassung anpassen</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.sectionLabel}>Format</p>
          <div className={styles.formatGrid}>
            {AUDIO_FORMATS.map((f) => (
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

          <div className={styles.row}>
            <div className={styles.field}>
              <p className={styles.sectionLabel}>Sprache auswählen</p>
              <select className={styles.select} value={language} onChange={(e) => setLanguage(e.target.value as StudioLanguage)}>
                {STUDIO_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <p className={styles.sectionLabel}>Länge</p>
              <div className={styles.lengthToggle}>
                {(["kurz", "standard"] as AudioLength[]).map((l) => (
                  <button key={l} type="button" className={`${styles.lengthBtn} ${length === l ? styles.lengthBtnActive : ""}`} onClick={() => setLength(l)}>
                    {length === l && <span className="material-symbols-outlined">check</span>}
                    {l === "kurz" ? "Kurz" : "Standard"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className={styles.sectionLabel}>Worauf sollen sich die KI-Moderatoren in dieser Folge konzentrieren?</p>
          <textarea
            className={styles.focus}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={"Fokussiere dich auf …\n- Wichtige Punkte\n- Konkrete Beispiele"}
            rows={4}
          />
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.createBtn} onClick={submit}>
            Erstellen
          </button>
        </footer>
      </div>
    </div>
  )
}
