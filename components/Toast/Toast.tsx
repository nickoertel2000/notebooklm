"use client"

import "material-symbols"
import { useEffect, useEffectEvent } from "react"
import styles from "./Toast.module.scss"

const VISIBLE_MS = 8000

type ToastProps = {
  message: string
  // Oben für Meldungen aus dem Header, damit sie nicht über denen der Seite liegen.
  placement?: "top" | "bottom"
  onClose: () => void
}

export default function Toast({ message, placement = "bottom", onClose }: ToastProps) {
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const id = setTimeout(() => close(), VISIBLE_MS)
    return () => clearTimeout(id)
  }, [message])

  return (
    <div className={`${styles.toast} ${styles[placement]}`} role="alert">
      <span className={`material-symbols-outlined ${styles.icon}`}>error</span>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Meldung schließen">
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  )
}
