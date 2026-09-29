"use client"

import { useState } from "react"
import "material-symbols"
import type { Flashcards } from "@/lib/studio"
import styles from "./FlashcardsView.module.scss"

export default function FlashcardsView({ data }: { data: Flashcards }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = data.cards[index]
  const last = data.cards.length - 1

  function go(next: number) {
    setIndex(Math.min(Math.max(next, 0), last))
    setFlipped(false)
  }

  return (
    <div
      className={styles.wrap}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1)
        else if (e.key === "ArrowRight") go(index + 1)
        else if (e.key === " ") {
          e.preventDefault()
          setFlipped((f) => !f)
        }
      }}
    >
      <p className={styles.hint}>Klicke auf die Karte, um sie umzudrehen. Pfeiltasten blättern.</p>

      <button type="button" className={`${styles.card} ${flipped ? styles.cardFlipped : ""}`} onClick={() => setFlipped((f) => !f)}>
        <span className={styles.inner}>
          <span className={styles.front}>
            <span className={styles.side}>Frage</span>
            <span className={styles.text}>{card.front}</span>
            <span className={styles.turn}>Antwort ansehen</span>
          </span>
          <span className={styles.back}>
            <span className={styles.side}>Antwort</span>
            <span className={styles.text}>{card.back}</span>
          </span>
        </span>
      </button>

      <div className={styles.nav}>
        <button type="button" className={styles.navBtn} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorherige Karte">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className={styles.counter}>
          {index + 1} / {data.cards.length}
        </span>
        <button type="button" className={styles.navBtn} onClick={() => go(index + 1)} disabled={index === last} aria-label="Nächste Karte">
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
