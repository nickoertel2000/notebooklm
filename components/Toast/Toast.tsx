"use client"

import "material-symbols"
import { useEffect, useEffectEvent } from "react"
import styles from "./Toast.module.scss"

const VISIBLE_MS = 8000

type ToastProps = {
  message: string
  onClose: () => void
}

export default function Toast({ message, onClose }: ToastProps) {
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const id = setTimeout(() => close(), VISIBLE_MS)
    return () => clearTimeout(id)
  }, [message])

  return (
    <div className={styles.toast} role="alert">
      <span className={`material-symbols-outlined ${styles.icon}`}>error</span>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Meldung schließen">
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  )
}
