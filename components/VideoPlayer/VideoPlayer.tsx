"use client"

import "material-symbols"
import styles from "./VideoPlayer.module.scss"
import Modal from "@/components/Modal/Modal"

type VideoPlayerProps = {
  title: string
  src: string
  onClose: () => void
}

export default function VideoPlayer({ title, src, onClose }: VideoPlayerProps) {
  return (
    <Modal label={title} className={styles.modal} onClose={onClose}>
      <header className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      <video className={styles.video} src={src} controls autoPlay playsInline />
    </Modal>
  )
}
