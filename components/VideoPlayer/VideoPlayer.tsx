"use client"

import "material-symbols"
import styles from "./VideoPlayer.module.scss"

type VideoPlayerProps = {
  title: string
  src: string
  onClose: () => void
}

// Vollbild-Overlay, das die erzeugte MP4-Video-Übersicht abspielt.
export default function VideoPlayer({ title, src, onClose }: VideoPlayerProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <video className={styles.video} src={src} controls autoPlay playsInline />
      </div>
    </div>
  )
}
