"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import styles from "./AddSourceModal.module.scss"

const ROTATING_WORDS = ["Ihre Dokumente", "Websites", "YouTube-Videos", "Ihre Notizen"] as const

const HOLD_DURATION = 3000 // ms sichtbar
const EXIT_DURATION = 280 // ms (muss zur SCSS-Keyframe-Dauer passen)

interface AddSourceModalProps {
  /** Wird beim Klick auf das X bzw. den Overlay-Hintergrund aufgerufen. */
  onClose?: () => void
}

export default function AddSourceModal({ onClose }: AddSourceModalProps) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<"enter" | "exit">("enter")

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
          in Audio- und Video-Zusammenfassungen umwandeln lassen
        </h2>

        {/* Suchfeld */}
        <div className={styles.searchBox}>
          <input className={styles.searchInput} type="text" placeholder="Im Web nach neuen Quellen suchen" />
          <div className={styles.searchControls}>
            <div className={styles.pillGroup}>
              <button type="button" className={styles.pill}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  language
                </span>
                <span>Web</span>
                <span className={`material-symbols-outlined ${styles.icon} ${styles.iconChevron}`} aria-hidden="true">
                  expand_more
                </span>
              </button>
              <button type="button" className={styles.pill}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  manage_search
                </span>
                <span>Schnelle Recherche</span>
                <span className={`material-symbols-outlined ${styles.icon} ${styles.iconChevron}`} aria-hidden="true">
                  expand_more
                </span>
              </button>
            </div>
            <button type="button" className={styles.searchSubmit} aria-label="Suchen">
              <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                search
              </span>
            </button>
          </div>
        </div>

        {/* Upload-Bereich */}
        <div className={styles.uploadZone}>
          <p className={styles.uploadHeadline}>oder laden Sie Ihre Dateien hoch</p>
          <p className={styles.uploadHint}>
            PDF, Bilder, Dokumente, Audio{" "}
            <a href="#" className={styles.moreLink}>
              und mehr
            </a>
          </p>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.sourceButton}>
              <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                upload
              </span>
              <span>Dateien hochladen</span>
            </button>
            <button type="button" className={styles.sourceButton}>
              {/* Websites: link-Symbol + YouTube-SVG direkt daneben, gleiche Höhe */}
              <span className={styles.websitesIcon}>
                <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                  link
                </span>
                {/* aus public/icons/youtube.svg -> URL /icons/youtube.svg */}
                <Image src="/icons/youtube.svg" alt="" aria-hidden="true" width={20} height={20} className={styles.youtubeImg} unoptimized />
              </span>
              <span>Websites</span>
            </button>
            <button type="button" className={styles.sourceButton}>
              <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                add_to_drive
              </span>
              <span>Drive</span>
            </button>
            <button type="button" className={styles.sourceButton}>
              <span className={`material-symbols-outlined ${styles.icon}`} aria-hidden="true">
                content_paste
              </span>
              <span>Kopierter Text</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
