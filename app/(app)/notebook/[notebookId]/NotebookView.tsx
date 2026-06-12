"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "material-symbols/outlined.css"
import AddSourceModal, { AddSourcePayload } from "@/components/popup/AddSourceModal"
import AudioPlayer from "@/components/AudioPlayer/AudioPlayer"
import AudioModal, { AudioOptions } from "@/components/popup/AudioModal"
import ReportModal from "@/components/popup/ReportModal"
import ReportViewModal from "@/components/popup/ReportViewModal"
import { getAudioFormat } from "@/lib/audio"
import { getReportType, ReportType } from "@/lib/reports"
import { useDictation } from "@/lib/useDictation"
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

export type ReportItem = {
  id: string
  type: string
  title: string
  sourceCount: number
  status: string
  createdAt: string
}

export type AudioItem = {
  id: string
  format: string
  title: string
  durationSeconds: number | null
  sourceCount: number
  status: string
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
  initialReports: ReportItem[]
  initialAudios: AudioItem[]
}

export default function NotebookView({ notebookId, initialSources, initialMessages, initialReports, initialAudios }: Props) {
  const [sources, setSources] = useState<SourceItem[]>(initialSources)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [reports, setReports] = useState<ReportItem[]>(initialReports)
  const [audios, setAudios] = useState<AudioItem[]>(initialAudios)
  const [modalOpen, setModalOpen] = useState(initialSources.length === 0)
  const [reportOpen, setReportOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [viewReport, setViewReport] = useState<ReportItem | null>(null)
  const [menuReportId, setMenuReportId] = useState<string | null>(null)
  const [menuAudioId, setMenuAudioId] = useState<string | null>(null)
  // Aktuell abgespielte Audio-Übersicht inkl. presigned URL und Titel.
  const [playingAudio, setPlayingAudio] = useState<{ id: string; url: string; title: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSources.map((s) => s.id)))
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [openCitation, setOpenCitation] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Spracheingabe (Diktat) für das Chat-Eingabefeld.
  const dictation = useDictation("de-DE")
  const dictationBaseRef = useRef("")

  function startDictation() {
    // An bereits getippten Text anhängen.
    dictationBaseRef.current = input.trim() ? input.replace(/\s+$/, "") + " " : ""
    dictation.start((text) => setInput(dictationBaseRef.current + text))
  }

  // Nur ausgewählte, fertige Quellen zählen für Chat & Berichte.
  const selectedReadyIds = useMemo(
    () => sources.filter((s) => s.status === "ready" && selectedIds.has(s.id)).map((s) => s.id),
    [sources, selectedIds]
  )
  const readyCount = selectedReadyIds.length
  const allSelected = sources.length > 0 && sources.every((s) => selectedIds.has(s.id))

  function toggleSource(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(() => (allSelected ? new Set() : new Set(sources.map((s) => s.id))))
  }

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

  const refreshReports = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/reports`)
    if (!res.ok) return
    const data = await res.json()
    // Lokale Platzhalter (temp-…) behalten, übrige durch Server-Stand ersetzen.
    setReports((prev) => [...prev.filter((r) => r.id.startsWith("temp-")), ...data.reports])
  }, [notebookId])

  // Persistierte, noch laufende Berichte pollen (z. B. nach Reload während der
  // Erstellung). Live-Platzhalter werden über die laufende Anfrage aktualisiert.
  useEffect(() => {
    if (!reports.some((r) => r.status === "processing" && !r.id.startsWith("temp-"))) return
    const id = setInterval(refreshReports, 3000)
    return () => clearInterval(id)
  }, [reports, refreshReports])

  const refreshAudios = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/audio`)
    if (!res.ok) return
    const data = await res.json()
    setAudios((prev) => [...prev.filter((a) => a.id.startsWith("temp-")), ...data.audios])
  }, [notebookId])

  // Noch laufende Audio-Übersichten pollen (z. B. nach Reload während der Erstellung).
  useEffect(() => {
    if (!audios.some((a) => a.status === "processing" && !a.id.startsWith("temp-"))) return
    const id = setInterval(refreshAudios, 4000)
    return () => clearInterval(id)
  }, [audios, refreshAudios])

  // ⋮-Menü bei Klick außerhalb schließen.
  useEffect(() => {
    if (!menuReportId) return
    const close = () => setMenuReportId(null)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [menuReportId])

  useEffect(() => {
    if (!menuAudioId) return
    const close = () => setMenuAudioId(null)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [menuAudioId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleAddSource(payload: AddSourcePayload) {
    const base = `/api/notebooks/${notebookId}/sources`
    let newId: string | undefined
    if (payload.type === "pdf") {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pdf", filename: payload.file.name, contentType: payload.file.type || "application/pdf" })
      })
      if (!res.ok) throw new Error("Anlegen fehlgeschlagen")
      const { sourceId, uploadUrl } = await res.json()
      newId = sourceId
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
      newId = (await res.json()).sourceId
    } else {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", title: payload.title, text: payload.text })
      })
      if (!res.ok) throw new Error("Text fehlgeschlagen")
      newId = (await res.json()).sourceId
    }
    // Neue Quelle automatisch auswählen.
    if (newId) setSelectedIds((prev) => new Set(prev).add(newId!))
    setModalOpen(false)
    await refreshSources()
  }

  async function handleDeleteSource(sourceId: string) {
    await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: "DELETE" })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(sourceId)
      return next
    })
    await refreshSources()
  }

  // Bericht im Hintergrund erstellen: Popup schließen, Ladekarte zeigen, dann
  // den fertigen Bericht eintragen (oder als fehlgeschlagen markieren).
  async function handleCreateReport(type: ReportType) {
    setReportOpen(false)
    const tempId = `temp-${crypto.randomUUID()}`
    const placeholder: ReportItem = {
      id: tempId,
      type: type.id,
      title: type.label,
      sourceCount: selectedReadyIds.length,
      status: "processing",
      createdAt: new Date().toISOString()
    }
    setReports((prev) => [placeholder, ...prev])

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type.id, sourceIds: selectedReadyIds })
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Bericht fehlgeschlagen")
      const { report } = await res.json()
      setReports((prev) => prev.map((r) => (r.id === tempId ? report : r)))
    } catch {
      setReports((prev) => prev.map((r) => (r.id === tempId ? { ...r, status: "failed" } : r)))
    }
  }

  async function handleDeleteReport(reportId: string) {
    setMenuReportId(null)
    setReports((prev) => prev.filter((r) => r.id !== reportId))
    if (!reportId.startsWith("temp-")) {
      await fetch(`/api/notebooks/${notebookId}/reports/${reportId}`, { method: "DELETE" })
    }
  }

  // Audio-Übersicht im Hintergrund erstellen: Modal schließen, Ladekarte zeigen,
  // dann das fertige Audio eintragen (oder als fehlgeschlagen markieren).
  async function handleCreateAudio(options: AudioOptions) {
    setAudioOpen(false)
    const tempId = `temp-${crypto.randomUUID()}`
    const placeholder: AudioItem = {
      id: tempId,
      format: options.format.id,
      title: options.format.label,
      durationSeconds: null,
      sourceCount: selectedReadyIds.length,
      status: "processing",
      createdAt: new Date().toISOString()
    }
    setAudios((prev) => [placeholder, ...prev])

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: options.format.id,
          length: options.length,
          language: options.language,
          focus: options.focus,
          sourceIds: selectedReadyIds
        })
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Audio fehlgeschlagen")
      const { audio } = await res.json()
      setAudios((prev) => prev.map((a) => (a.id === tempId ? audio : a)))
    } catch {
      setAudios((prev) => prev.map((a) => (a.id === tempId ? { ...a, status: "failed" } : a)))
    }
  }

  async function handleDeleteAudio(audioId: string) {
    setMenuAudioId(null)
    setAudios((prev) => prev.filter((a) => a.id !== audioId))
    if (playingAudio?.id === audioId) setPlayingAudio(null)
    if (!audioId.startsWith("temp-")) {
      await fetch(`/api/notebooks/${notebookId}/audio/${audioId}`, { method: "DELETE" })
    }
  }

  // Beim Anklicken eines fertigen Audios die presigned URL laden und abspielen.
  async function handlePlayAudio(audioId: string) {
    if (playingAudio?.id === audioId) {
      setPlayingAudio(null)
      return
    }
    const res = await fetch(`/api/notebooks/${notebookId}/audio/${audioId}`)
    if (!res.ok) return
    const { audio } = await res.json()
    if (audio.url) setPlayingAudio({ id: audioId, url: audio.url, title: audio.title })
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    if (dictation.listening) dictation.stop()
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
        body: JSON.stringify({ message: trimmed, sourceIds: selectedReadyIds })
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
              <>
                <div className={styles.selectAllRow}>
                  <button
                    className={styles.selectAllRefresh}
                    aria-label="Quellen aktualisieren"
                    onClick={() => refreshSources()}
                  >
                    <span className="material-symbols-outlined">refresh</span>
                  </button>
                  <span className={styles.selectAllLabel}>Alle auswählen</span>
                  <button
                    className={styles.checkbox}
                    role="checkbox"
                    aria-checked={allSelected}
                    aria-label="Alle auswählen"
                    onClick={toggleAll}
                  >
                    <span className="material-symbols-outlined">check</span>
                  </button>
                </div>

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
                      <button
                        className={styles.checkbox}
                        role="checkbox"
                        aria-checked={selectedIds.has(s.id)}
                        aria-label={`Quelle „${s.title}“ auswählen`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSource(s.id)
                        }}
                      >
                        <span className="material-symbols-outlined">check</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
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
                placeholder={
                  dictation.listening
                    ? "Sprich jetzt…"
                    : readyCount === 0
                      ? "Erst Quellen hinzufügen…"
                      : "Frage zu deinen Quellen stellen"
                }
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
              {studioTools.map((tool) => {
                const isReports = tool.label === "Berichte"
                const isAudio = tool.label === "Audio-Übersicht"
                const interactive = isReports || isAudio
                const onClick = isReports
                  ? () => setReportOpen(true)
                  : isAudio
                    ? () => setAudioOpen(true)
                    : undefined
                return (
                  <button
                    key={tool.label}
                    className={styles.studioCard}
                    style={{ "--tint": tool.tint } as React.CSSProperties}
                    disabled={interactive ? readyCount === 0 : false}
                    title={interactive && readyCount === 0 ? "Zuerst Quellen auswählen" : undefined}
                    onClick={onClick}
                  >
                    <span className={`material-symbols-outlined ${styles.studioCardIcon}`}>{tool.icon}</span>
                    <span className={styles.studioCardLabel}>{tool.label}</span>
                  </button>
                )
              })}
            </div>

            {audios.length > 0 && (
              <ul className={styles.reportList}>
                {audios.map((a) => {
                  const meta = getAudioFormat(a.format)
                  const processing = a.status === "processing"
                  const failed = a.status === "failed"
                  const isPlaying = playingAudio?.id === a.id
                  return (
                    <li key={a.id} className={styles.audioEntry}>
                      <div
                        className={`${styles.reportItem} ${processing ? styles.reportItemBusy : ""}`}
                        onClick={() => !processing && !failed && handlePlayAudio(a.id)}
                      >
                        <span
                          className={`material-symbols-outlined ${styles.reportIcon} ${processing ? styles.reportIconBusy : ""}`}
                        >
                          {processing ? "sync" : failed ? "error" : isPlaying ? "pause_circle" : "play_circle"}
                        </span>
                        <div className={styles.reportText}>
                          <p className={styles.reportTitle}>
                            {processing ? "Audio wird erstellt…" : failed ? "Erstellung fehlgeschlagen" : a.title}
                          </p>
                          <p className={styles.reportMeta}>
                            {processing
                              ? `basierend auf ${a.sourceCount} ${a.sourceCount === 1 ? "Quelle" : "Quellen"}`
                              : `${meta?.label ?? "Audio"} · ${a.sourceCount} ${a.sourceCount === 1 ? "Quelle" : "Quellen"}${a.durationSeconds ? ` · ${formatDuration(a.durationSeconds)}` : ""} · ${relativeTime(a.createdAt)}`}
                          </p>
                        </div>

                        {!processing && (
                          <div className={styles.reportMenuWrap} onClick={(e) => e.stopPropagation()}>
                            <button
                              className={styles.reportMenuBtn}
                              aria-label="Optionen"
                              onClick={() => setMenuAudioId((cur) => (cur === a.id ? null : a.id))}
                            >
                              <span className="material-symbols-outlined">more_vert</span>
                            </button>
                            {menuAudioId === a.id && (
                              <div className={styles.reportMenu} role="menu">
                                <button className={styles.reportMenuItem} onClick={() => handleDeleteAudio(a.id)}>
                                  <span className="material-symbols-outlined">delete</span>
                                  Löschen
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {reports.length > 0 && (
              <ul className={styles.reportList}>
                {reports.map((r) => {
                  const meta = getReportType(r.type)
                  const processing = r.status === "processing"
                  const failed = r.status === "failed"
                  return (
                    <li
                      key={r.id}
                      className={`${styles.reportItem} ${processing ? styles.reportItemBusy : ""}`}
                      onClick={() => !processing && !failed && setViewReport(r)}
                    >
                      <span className={`material-symbols-outlined ${styles.reportIcon} ${processing ? styles.reportIconBusy : ""}`}>
                        {processing ? "sync" : failed ? "error" : (meta?.icon ?? "description")}
                      </span>
                      <div className={styles.reportText}>
                        <p className={styles.reportTitle}>
                          {processing ? "Bericht wird erstellt…" : failed ? "Erstellung fehlgeschlagen" : r.title}
                        </p>
                        <p className={styles.reportMeta}>
                          {processing
                            ? `basierend auf ${r.sourceCount} ${r.sourceCount === 1 ? "Quelle" : "Quellen"}`
                            : `${meta?.metaLabel ?? "Bericht"} · ${r.sourceCount} ${r.sourceCount === 1 ? "Quelle" : "Quellen"} · ${relativeTime(r.createdAt)}`}
                        </p>
                      </div>

                      {!processing && (
                        <div className={styles.reportMenuWrap} onClick={(e) => e.stopPropagation()}>
                          <button
                            className={styles.reportMenuBtn}
                            aria-label="Optionen"
                            onClick={() => setMenuReportId((cur) => (cur === r.id ? null : r.id))}
                          >
                            <span className="material-symbols-outlined">more_vert</span>
                          </button>
                          {menuReportId === r.id && (
                            <div className={styles.reportMenu} role="menu">
                              <button className={styles.reportMenuItem} onClick={() => handleDeleteReport(r.id)}>
                                <span className="material-symbols-outlined">delete</span>
                                Löschen
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {playingAudio && (
            <AudioPlayer
              title={playingAudio.title}
              src={playingAudio.url}
              onClose={() => setPlayingAudio(null)}
            />
          )}
        </section>
      </div>

      <p className={styles.disclaimer}>NotebookLM kann Fehler machen, überprüfe daher die Antworten.</p>

      {modalOpen && <AddSourceModal onClose={() => setModalOpen(false)} onAdd={handleAddSource} />}
      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} onSelect={handleCreateReport} />}
      {audioOpen && <AudioModal onClose={() => setAudioOpen(false)} onCreate={handleCreateAudio} />}
      {viewReport && (
        <ReportViewModal
          notebookId={notebookId}
          reportId={viewReport.id}
          title={viewReport.title}
          onClose={() => setViewReport(null)}
        />
      )}
    </div>
  )
}

// "Vor 1 Min.", "Vor 2 Std.", "Vor 3 Tagen" – kurze relative Zeitangabe (de).
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "Gerade eben"
  if (min < 60) return `Vor ${min} Min.`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `Vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  return `Vor ${days} ${days === 1 ? "Tag" : "Tagen"}`
}

function sourceTitleFor(sources: SourceItem[], sourceId: string) {
  return sources.find((s) => s.id === sourceId)?.title ?? "Quelle"
}

// "1:05 Min." – Dauer in mm:ss.
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")} Min.`
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
