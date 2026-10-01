"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

// Header und Notebook-Ansicht liegen in getrennten Teilbäumen der Seite. Beide ändern den Titel:
// der Header beim Umbenennen, die Ansicht über den automatischen Titel nach der ersten Quelle.
type NotebookTitleState = {
  title: string
  emoji: string
  setTitle: (title: string, emoji?: string | null) => void
}

const NotebookTitleContext = createContext<NotebookTitleState | null>(null)

type ProviderProps = { initialTitle: string; initialEmoji: string; children: ReactNode }

export function NotebookTitleProvider({ initialTitle, initialEmoji, children }: ProviderProps) {
  const [title, setTitleState] = useState(initialTitle)
  const [emoji, setEmoji] = useState(initialEmoji)

  const value = useMemo<NotebookTitleState>(
    () => ({
      title,
      emoji,
      setTitle: (nextTitle, nextEmoji) => {
        setTitleState(nextTitle)
        if (nextEmoji) setEmoji(nextEmoji)
      }
    }),
    [title, emoji]
  )

  return <NotebookTitleContext value={value}>{children}</NotebookTitleContext>
}

export function useNotebookTitle(): NotebookTitleState {
  const state = useContext(NotebookTitleContext)
  if (!state) throw new Error("useNotebookTitle braucht einen NotebookTitleProvider")
  return state
}
