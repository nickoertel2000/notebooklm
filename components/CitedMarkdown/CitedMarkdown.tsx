"use client"

import { Fragment, ReactNode } from "react"
import type { Citation } from "@/app/(app)/notebook/[notebookId]/NotebookView"
import Markdown from "@/components/Markdown/Markdown"
import styles from "./CitedMarkdown.module.scss"

// [n] oder [n, m] wie im Chat-Prompt verlangt. Die Capture-Gruppe lässt split() die Marker behalten.
const MARKER_SPLIT = /(\[\d+(?:\s*,\s*\d+)*\])/g
const MARKER = /^\[(\d+(?:\s*,\s*\d+)*)\]$/

const markerNumbers = (token: string) => (MARKER.exec(token)?.[1] ?? "").split(",").map((n) => Number(n.trim()))

type Props = {
  content: string
  // null während des Streamings: Chips sind dann sichtbar, aber noch nicht klickbar.
  citations: Citation[] | null
  sourceTitle: (sourceId: string) => string
  onSelect: (citation: Citation) => void
}

export default function CitedMarkdown({ content, citations, sourceTitle, onSelect }: Props) {
  const byMarker = new Map((citations ?? []).map((c) => [c.marker, c]))
  const isKnown = (marker: number) => citations === null || byMarker.has(marker)

  const displayNumber = new Map<number, number>()
  for (const token of content.split(MARKER_SPLIT)) {
    if (!MARKER.test(token)) continue
    for (const marker of markerNumbers(token)) {
      if (isKnown(marker) && !displayNumber.has(marker)) displayNumber.set(marker, displayNumber.size + 1)
    }
  }

  function renderChip(marker: number, key: number): ReactNode {
    const number = displayNumber.get(marker)
    if (number === undefined) return <Fragment key={key}>[{marker}]</Fragment>

    const citation = byMarker.get(marker)
    if (!citation) {
      return (
        <span key={key} className={`${styles.chip} ${styles.pending}`}>
          {number}
        </span>
      )
    }

    const title = sourceTitle(citation.sourceId)
    return (
      <span key={key} className={styles.cite}>
        <button type="button" className={styles.chip} onClick={() => onSelect(citation)} aria-label={`Zitat ${number}: ${title}`}>
          {number}
        </button>
        <span role="tooltip" className={styles.popover}>
          <strong className={styles.popoverTitle}>{title}</strong>
          {citation.snippet}
        </span>
      </span>
    )
  }

  const renderText = (text: string): ReactNode =>
    text
      .split(MARKER_SPLIT)
      .map((token, i) => (MARKER.test(token) ? <Fragment key={i}>{markerNumbers(token).map(renderChip)}</Fragment> : <Fragment key={i}>{token}</Fragment>))

  return <Markdown renderText={renderText}>{content}</Markdown>
}
