"use client"

import CitedMarkdown from "@/components/CitedMarkdown/CitedMarkdown"
import type { ChatMessage, Citation } from "@/lib/items"
import { useDictation } from "@/lib/useDictation"
import "material-symbols"
import { useEffect, useRef, useState } from "react"
import styles from "../notebook.module.scss"

type ChatPanelProps = {
  messages: ChatMessage[]
  streaming: boolean
  readyCount: number
  sourceTitle: (sourceId: string) => string
  onSend: (text: string) => void
  onStop: () => void
  onCitation: (citation: Citation) => void
}

export default function ChatPanel({ messages, streaming, readyCount, sourceTitle, onSend, onStop, onCitation }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const dictation = useDictation("de-DE")
  const dictationBaseRef = useRef("")

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function startDictation() {
    dictationBaseRef.current = input.trim() ? input.replace(/\s+$/, "") + " " : ""
    dictation.start((text) => setInput(dictationBaseRef.current + text))
  }

  function submit() {
    if (!input.trim() || streaming) return
    if (dictation.listening) dictation.stop()
    onSend(input)
    setInput("")
  }

  return (
    <section className={`${styles.panel} ${styles.chat}`}>
      <header className={styles.panelHeader}>
        <h2>Chat</h2>
      </header>

      {messages.length === 0 ? (
        <div className={styles.chatBody}>
          <span className={styles.wave} role="img" aria-label="Winkende Hand">
            👋
          </span>
          <h1 className={styles.chatTitle}>Lass uns dein Notebook einrichten…</h1>
          <p className={styles.chatLead}>
            Füge links Quellen hinzu und stelle dann unten eine Frage. Antworten werden ausschließlich aus deinen Quellen erzeugt und mit anklickbaren Zitaten
            belegt.
          </p>
        </div>
      ) : (
        <div className={styles.messageList}>
          {messages.map((m) => (
            <div key={m.id} className={`${styles.message} ${m.role === "user" ? styles.messageUser : styles.messageAssistant}`}>
              <div className={styles.messageContent}>
                {m.role === "user" ? (
                  m.content
                ) : m.content ? (
                  <CitedMarkdown content={m.content} citations={m.citations} sourceTitle={sourceTitle} onSelect={onCitation} />
                ) : streaming ? (
                  "…"
                ) : (
                  ""
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <footer className={styles.chatFooter}>
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            className={styles.composerInput}
            type="text"
            placeholder={dictation.listening ? "Sprich jetzt…" : readyCount === 0 ? "Erst Quellen hinzufügen…" : "Frage zu deinen Quellen stellen"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
          />
          <span className={styles.sourceCount}>
            {readyCount} {readyCount === 1 ? "Quelle" : "Quellen"}
          </span>
          {dictation.supported && (
            <button
              type="button"
              className={`${styles.micButton} ${dictation.listening ? styles.micButtonActive : ""}`}
              aria-label={dictation.listening ? "Diktat beenden" : "Diktieren"}
              onClick={() => (dictation.listening ? dictation.stop() : startDictation())}
              disabled={streaming}
            >
              <span className="material-symbols-outlined">{dictation.listening ? "stop" : "mic"}</span>
            </button>
          )}
          {streaming ? (
            <button className={styles.sendButton} aria-label="Antwort stoppen" type="button" onClick={onStop}>
              <span className="material-symbols-outlined">stop</span>
            </button>
          ) : (
            <button className={styles.sendButton} aria-label="Senden" type="submit" disabled={!input.trim() || readyCount === 0}>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          )}
        </form>
      </footer>
    </section>
  )
}
