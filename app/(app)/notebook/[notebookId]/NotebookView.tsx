"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import "material-symbols/outlined.css"
import AddSourceModal, { AddSourcePayload } from "@/components/popup/AddSourceModal"
import styles from "../notebook.module.scss"

export type Citation = {
  sourceId: string
  chunkId: string
  snippet: string
  page: number | null
  charStart: number | null
  charEnd: number | null
}

export type ChatMessage = {
  id: string
  role: string
  content: string
  citations: Citation[] | null
}

export type SourceItem = {
  id: string
  type: string
  title: string
  status: string
  error: string | null
  createdAt: string
}

const SOURCE_ICON: Record<string, string> = { pdf: "picture_as_pdf", url: "link", text: "description" }

const studioTools = [
  { label: "Audio-Übersicht", icon: "graphic_eq", tint: "#8ab4f8" },
  { label: "Mindmap", icon: "account_tree", tint: "#81c995" },
  { label: "Berichte", icon: "summarize", tint: "#fdd663" }
]

type Props = {
  notebookId: string
  title: string
  initialSources: SourceItem[]
  initialMessages: ChatMessage[]
}

export default function NotebookView({ notebookId, initialSources, initialMessages }: Props) {
  const [sources, setSources] = useState<SourceItem[]>(initialSources)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [modalOpen, setModalOpen] = useState(false)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [openCitation, setOpenCitation] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const readyCount = sources.filter((s) => s.status === "ready").length

  const refreshSources = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/sources`)
    if (res.ok) {
      const data = await res.json()
      setSources(data.sources)
    }
  }, [notebookId])

  // Solange Quellen verarbeitet werden, Status pollen.
  useEffect(() => {
    if (!sources.some((s) => s.status === "processing")) return
    const id = setInterval(refreshSources, 2500)
    return () => clearInterval(id)
  }, [sources, refreshSources])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleAddSource(payload: AddSourcePayload) {
    const base = `/api/notebooks/${notebookId}/sources`
    if (payload.type === "pdf") {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pdf", filename: payload.file.name, contentType: payload.file.type || "application/pdf" })
      })
      if (!res.ok) throw new Error("Anlegen fehlgeschlagen")
      const { uploadUrl } = await res.json()
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: payload.file,
        headers: { "Content-Type": payload.file.type || "application/pdf" }
      })
      if (!put.ok) throw new Error("Upload fehlgeschlagen")
    } else if (payload.type === "url") {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", url: payload.url })
      })
      if (!res.ok) throw new Error((await res.json()).error || "URL fehlgeschlagen")
    } else {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", title: payload.title, text: payload.text })
      })
      if (!res.ok) throw new Error("Text fehlgeschlagen")
    }
    setModalOpen(false)
    await refreshSources()
  }

  async function handleDeleteSource(sourceId: string) {
    await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" })
    await refreshSources()
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setInput("")

    const assistantId = `streaming-${crypto.randomUUID()}`
    setMessages((prev) => [
      ...prev,
      { id: `user-${crypto.randomUUID()}`, role: "user", content: trimmed, citations: null },
      { id: assistantId, role: "assistant", content: "", citations: null }
    ])
    setStreaming(true)

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      })
      if (!res.body) throw new Error("Kein Stream")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line)
          if (evt.type === "text") {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + evt.text } : m)))
          } else if (evt.type === "done") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, id: evt.messageId, citations: evt.citations } : m))
            )
          } else if (evt.type === "error") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}\n\n[Fehler: ${evt.error}]` } : m))
            )
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}\n\n[Fehler: ${String(err)}]` } : m))
      )
    } finally {
      setStreaming(false)
    }
  }

  function focusCitation(citation: Citation) {
    setActiveSourceId(citation.sourceId)
    setOpenCitation((cur) => (cur === citation.chunkId ? null : citation.chunkId))
  }

  return (
    <div className={styles.shell}>
      <div className={styles.columns}>
        {/* ───────────── Quellen ───────────── */}
        <section className={`${styles.panel} ${styles.sources}`}>
          <header className={styles.panelHeader}>
            <h2>Quellen</h2>
          </header>

          <div className={styles.sourcesBody}>
            <button className={styles.addSource} onClick={() => setModalOpen(true)}>
              <span className="material-symbols-outlined">add</span>
              Quellen hinzufügen
            </button>

            {sources.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={`material-symbols-outlined ${styles.emptyIcon}`}>description</span>
                <p className={styles.emptyTitle}>Gespeicherte Quellen werden hier angezeigt</p>
                <p className={styles.emptyText}>
                  Klicke oben auf „Quellen hinzufügen“, um PDFs, Websites oder eingefügten Text hinzuzufügen.
                </p>
              </div>
            ) : (
              <ul className={styles.sourceList}>
                {sources.map((s) => (
                  <li
                    key={s.id}
                    className={`${styles.sourceItem} ${activeSourceId === s.id ? styles.sourceItemActive : ""}`}
                    onClick={() => setActiveSourceId(s.id)}
                  >
                    <span className={`material-symbols-outlined ${styles.sourceIcon}`}>
                      {SOURCE_ICON[s.type] ?? "description"}
                    </span>
                    <span className={styles.sourceTitle}>{s.title}</span>
                    <SourceStatus status={s.status} />
                    <button
                      className={styles.sourceDelete}
                      aria-label="Quelle löschen"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSource(s.id)
                      }}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ───────────── Chat ───────────── */}
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
                Füge links Quellen hinzu und stelle dann unten eine Frage. Antworten werden ausschließlich aus deinen
                Quellen erzeugt und mit anklickbaren Zitaten belegt.
              </p>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((m) => (
                <div key={m.id} className={`${styles.message} ${m.role === "user" ? styles.messageUser : styles.messageAssistant}`}>
                  <div className={styles.messageContent}>{m.content || (streaming ? "…" : "")}</div>
                  {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                    <div className={styles.citations}>
                      {m.citations.map((c, i) => (
                        <button key={c.chunkId} className={styles.citationChip} onClick={() => focusCitation(c)}>
                          <span className="material-symbols-outlined">format_quote</span>
                          {i + 1}. {sourceTitleFor(sources, c.sourceId)}
                        </button>
                      ))}
                      {m.citations
                        .filter((c) => c.chunkId === openCitation)
                        .map((c) => (
                          <p key={`snippet-${c.chunkId}`} className={styles.citationSnippet}>
                            „{c.snippet}“
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          <footer className={styles.chatFooter}>
            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault()
                sendMessage(input)
              }}
            >
              <input
                className={styles.composerInput}
                type="text"
                placeholder={readyCount === 0 ? "Erst Quellen hinzufügen…" : "Frage zu deinen Quellen stellen"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
              />
              <span className={styles.sourceCount}>
                {readyCount} {readyCount === 1 ? "Quelle" : "Quellen"}
              </span>
              <button className={styles.sendButton} aria-label="Senden" type="submit" disabled={streaming || !input.trim()}>
                <span className="material-symbols-outlined">{streaming ? "progress_activity" : "arrow_forward"}</span>
              </button>
            </form>
          </footer>
        </section>

        {/* ───────────── Studio ───────────── */}
        <section className={`${styles.panel} ${styles.studio}`}>
          <header className={styles.panelHeader}>
            <h2>Studio</h2>
          </header>

          <div className={styles.studioBody}>
            <div className={styles.studioGrid}>
              {studioTools.map((tool) => (
                <button key={tool.label} className={styles.studioCard} style={{ "--tint": tool.tint } as React.CSSProperties}>
                  <span className={`material-symbols-outlined ${styles.studioCardIcon}`}>{tool.icon}</span>
                  <span className={styles.studioCardLabel}>{tool.label}</span>
                </button>
              ))}
            </div>

            <div className={styles.emptyState}>
              <span className={`material-symbols-outlined ${styles.emptyIcon}`}>auto_awesome</span>
              <p className={styles.emptyTitle}>Studio-Funktionen folgen später.</p>
            </div>
          </div>
        </section>
      </div>

      <p className={styles.disclaimer}>NotebookLM kann Fehler machen, überprüfe daher die Antworten.</p>

      {modalOpen && <AddSourceModal onClose={() => setModalOpen(false)} onAdd={handleAddSource} />}
    </div>
  )
}

function sourceTitleFor(sources: SourceItem[], sourceId: string) {
  return sources.find((s) => s.id === sourceId)?.title ?? "Quelle"
}

function SourceStatus({ status }: { status: string }) {
  if (status === "ready") {
    return <span className={`material-symbols-outlined ${styles.statusReady}`}>check_circle</span>
  }
  if (status === "failed") {
    return <span className={`material-symbols-outlined ${styles.statusFailed}`}>error</span>
  }
  return <span className={`material-symbols-outlined ${styles.statusProcessing}`}>progress_activity</span>
}
