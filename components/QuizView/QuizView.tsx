"use client"

import { useState } from "react"
import "material-symbols"
import type { Quiz } from "@/lib/studio"
import styles from "./QuizView.module.scss"

export default function QuizView({ data }: { data: Quiz }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => data.questions.map(() => null))
  const [finished, setFinished] = useState(false)

  const question = data.questions[index]
  const chosen = answers[index]
  const score = answers.filter((a, i) => a === data.questions[i].answer).length

  function choose(option: number) {
    if (chosen !== null) return
    setAnswers((prev) => prev.map((a, i) => (i === index ? option : a)))
  }

  function restart() {
    setAnswers(data.questions.map(() => null))
    setIndex(0)
    setFinished(false)
  }

  if (finished) {
    return (
      <div className={styles.result}>
        <span className={`material-symbols-outlined ${styles.resultIcon}`}>emoji_events</span>
        <p className={styles.resultScore}>
          {score} von {data.questions.length} richtig
        </p>
        <button type="button" className={styles.primary} onClick={restart}>
          Noch einmal
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.progress}>
        <span>
          Frage {index + 1} von {data.questions.length}
        </span>
        <span className={styles.bar}>
          <span style={{ width: `${((index + (chosen !== null ? 1 : 0)) / data.questions.length) * 100}%` }} />
        </span>
      </div>

      <p className={styles.question}>{question.question}</p>

      <ol className={styles.options}>
        {question.options.map((option, i) => {
          const state = chosen === null ? "" : i === question.answer ? styles.correct : i === chosen ? styles.wrong : styles.muted
          return (
            <li key={i}>
              <button type="button" className={`${styles.option} ${state}`} onClick={() => choose(i)} disabled={chosen !== null}>
                <span className={styles.letter}>{String.fromCharCode(65 + i)}</span>
                <span className={styles.optionText}>{option}</span>
                {chosen !== null && i === question.answer && <span className="material-symbols-outlined">check_circle</span>}
                {chosen === i && i !== question.answer && <span className="material-symbols-outlined">cancel</span>}
              </button>
            </li>
          )
        })}
      </ol>

      {chosen !== null && (
        <div className={styles.explanation}>
          <strong>{chosen === question.answer ? "Richtig." : "Leider falsch."}</strong> {question.explanation}
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
          Zurück
        </button>
        {index < data.questions.length - 1 ? (
          <button type="button" className={styles.primary} onClick={() => setIndex((i) => i + 1)} disabled={chosen === null}>
            Weiter
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={() => setFinished(true)} disabled={chosen === null}>
            Auswertung
          </button>
        )}
      </div>
    </div>
  )
}
