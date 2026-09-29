"use client"

import AudioPlayer from "@/components/AudioPlayer/AudioPlayer"
import CitedMarkdown from "@/components/CitedMarkdown/CitedMarkdown"
import StudioPanel, { StudioEntryKind, StudioTool } from "@/components/StudioPanel/StudioPanel"
import VideoPlayer from "@/components/VideoPlayer/VideoPlayer"
import WebSourceSearch from "@/components/WebSourceSearch/WebSourceSearch"
import AddSourceModal, { AddSourcePayload } from "@/components/popup/AddSourceModal"
import AudioModal, { AudioOptions } from "@/components/popup/AudioModal"
import ReportModal, { ReportGeneratePayload } from "@/components/popup/ReportModal"
import ReportViewModal from "@/components/popup/ReportViewModal"
import StudioOptionsModal from "@/components/popup/StudioOptionsModal"
import VideoModal, { VideoOptions } from "@/components/popup/VideoModal"
import { DEFAULT_NOTEBOOK_TITLE } from "@/lib/notebookTitle"
import { getReportType } from "@/lib/reports"
import { getStudioFormat, StudioFormat, StudioOptions } from "@/lib/studio"
import { hostOf } from "@/lib/url"
import { useDictation } from "@/lib/useDictation"
import "material-symbols"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "../notebook.module.scss"
import { readError, readJson } from "@/lib/api/client"

export type Citation = {
  marker: number
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
  sourceUrl: string | null
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

export type VideoItem = {
  id: string
  format: string
  title: string
  visualStyle: string
  durationSeconds: number | null
  sourceCount: number
  status: string
  createdAt: string
}

const SOURCE_ICON: Record<string, string> = { pdf: "picture_as_pdf", url: "link", text: "description" }

type Props = {
  notebookId: string
  title: string
  initialSources: SourceItem[]
  initialMessages: ChatMessage[]
  initialReports: ReportItem[]
  initialAudios: AudioItem[]
  initialVideos: VideoItem[]
}

export default function NotebookView({ notebookId, title, initialSources, initialMessages, initialReports, initialAudios, initialVideos }: Props) {
  const [notebookTitle, setNotebookTitle] = useState(title)
  const autoTitlingRef = useRef(false)
  const [sources, setSources] = useState<SourceItem[]>(initialSources)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [reports, setReports] = useState<ReportItem[]>(initialReports)
  const [audios, setAudios] = useState<AudioItem[]>(initialAudios)
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos)
  const [modalOpen, setModalOpen] = useState(initialSources.length === 0)
  const [reportOpen, setReportOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [viewReport, setViewReport] = useState<ReportItem | null>(null)
  const [studioOptions, setStudioOptions] = useState<StudioFormat | null>(null)
  const [playingAudio, setPlayingAudio] = useState<{ id: string; url: string; title: string } | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<{ id: string; url: string; title: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSources.map((s) => s.id)))
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const dictation = useDictation("de-DE")
  const dictationBaseRef = useRef("")

  function startDictation() {
    dictationBaseRef.current = input.trim() ? input.replace(/\s+$/, "") + " " : ""
    dictation.start((text) => setInput(dictationBaseRef.current + text))
  }

  const selectedReadyIds = useMemo(() => sources.filter((s) => s.status === "ready" && selectedIds.has(s.id)).map((s) => s.id), [sources, selectedIds])
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
      const data = await readJson<{ sources: SourceItem[] }>(res)
      setSources(data.sources)
    }
  }, [notebookId])

  useEffect(() => {
    if (!sources.some((s) => s.status === "processing")) return
    const id = setInterval(refreshSources, 2500)
    return () => clearInterval(id)
  }, [sources, refreshSources])

  const refreshReports = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/reports`)
    if (!res.ok) return
    const data = await readJson<{ reports: ReportItem[] }>(res)
    // temp-Platzhalter gehören zu noch laufenden Anfragen und fehlen im Server-Stand.
    setReports((prev) => [...prev.filter((r) => r.id.startsWith("temp-")), ...data.reports])
  }, [notebookId])

  useEffect(() => {
    if (!reports.some((r) => r.status === "processing" && !r.id.startsWith("temp-"))) return
    const id = setInterval(refreshReports, 3000)
    return () => clearInterval(id)
  }, [reports, refreshReports])

  const refreshAudios = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/audio`)
    if (!res.ok) return
    const data = await readJson<{ audios: AudioItem[] }>(res)
    setAudios((prev) => [...prev.filter((a) => a.id.startsWith("temp-")), ...data.audios])
  }, [notebookId])

  useEffect(() => {
    if (!audios.some((a) => a.status === "processing" && !a.id.startsWith("temp-"))) return
    const id = setInterval(refreshAudios, 4000)
    return () => clearInterval(id)
  }, [audios, refreshAudios])

  const refreshVideos = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/video`)
    if (!res.ok) return
    const data = await readJson<{ videos: VideoItem[] }>(res)
    setVideos((prev) => [...prev.filter((v) => v.id.startsWith("temp-")), ...data.videos])
  }, [notebookId])

  useEffect(() => {
    if (!videos.some((v) => v.status === "processing" && !v.id.startsWith("temp-"))) return
    const id = setInterval(refreshVideos, 5000)
    return () => clearInterval(id)
  }, [videos, refreshVideos])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function maybeAutoTitle() {
    if (notebookTitle !== DEFAULT_NOTEBOOK_TITLE || autoTitlingRef.current) return
    autoTitlingRef.current = true
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/auto-title`, { method: "POST" })
      if (!res.ok) return
      const data = await readJson<{ title?: string; emoji?: string | null; generated: boolean }>(res)
      if (data.title) {
        setNotebookTitle(data.title)
        if (data.generated && data.title !== DEFAULT_NOTEBOOK_TITLE) {
          // Der Header ist eine eigene Komponente ohne gemeinsamen State.
          window.dispatchEvent(new CustomEvent("notebook-title", { detail: { title: data.title, emoji: data.emoji } }))
        }
      }
    } catch {
      // Auto-Titel ist optional.
    } finally {
      autoTitlingRef.current = false
    }
  }

  async function handleAddSource(payload: AddSourcePayload) {
    const base = `/api/notebooks/${notebookId}/sources`
    let newId: string | undefined
    if (payload.type === "pdf") {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pdf", filename: payload.file.name })
      })
      if (!res.ok) throw new Error(await readError(res, "Anlegen fehlgeschlagen"))
      const { sourceId } = await readJson<{ sourceId: string }>(res)
      newId = sourceId
      const put = await fetch(`${base}/${sourceId}/file`, {
        method: "PUT",
        body: payload.file,
        headers: { "Content-Type": "application/pdf" }
      })
      if (!put.ok) throw new Error(await readError(put, "Upload fehlgeschlagen"))
    } else if (payload.type === "url") {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", url: payload.url })
      })
      if (!res.ok) throw new Error(await readError(res, "URL fehlgeschlagen"))
      newId = (await readJson<{ sourceId: string }>(res)).sourceId
    } else {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", title: payload.title, text: payload.text })
      })
      if (!res.ok) throw new Error("Text fehlgeschlagen")
      newId = (await readJson<{ sourceId: string }>(res)).sourceId
    }
    if (newId) setSelectedIds((prev) => new Set(prev).add(newId!))
    setModalOpen(false)
    await refreshSources()
    maybeAutoTitle()
  }

  async function handleImportSources(urls: string[]) {
    const newIds: string[] = []
    for (const url of urls) {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "url", url })
        })
        if (res.ok) {
          const { sourceId } = await readJson<{ sourceId: string }>(res)
          if (sourceId) newIds.push(sourceId)
        }
      } catch {
        // Einzelne fehlgeschlagene URL überspringen.
      }
    }
    if (newIds.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        newIds.forEach((id) => next.add(id))
        return next
      })
    }
    await refreshSources()
    maybeAutoTitle()
  }

  async function handleRetrySource(sourceId: string) {
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, status: "processing", error: null } : s)))
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/${sourceId}`, { method: "POST" })
      if (!res.ok) throw new Error()
    } catch {
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, status: "failed" } : s)))
      return
    }
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

  function handleCreateReport(payload: ReportGeneratePayload) {
    setReportOpen(false)
    const title = payload.type ? (getReportType(payload.type)?.label ?? "Bericht") : (payload.title ?? "Eigener Bericht")
    startReport(payload, payload.type ?? "custom", title)
  }

  function handleCreateStudio(format: StudioFormat, options?: StudioOptions) {
    setStudioOptions(null)
    startReport({ format: format.id, ...options }, format.id, format.label)
  }

  async function startReport(body: object, type: string, title: string) {
    const tempId = `temp-${crypto.randomUUID()}`
    const placeholder: ReportItem = {
      id: tempId,
      type,
      title,
      sourceCount: selectedReadyIds.length,
      status: "processing",
      createdAt: new Date().toISOString()
    }
    setReports((prev) => [placeholder, ...prev])

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, sourceIds: selectedReadyIds })
      })
      if (!res.ok) throw new Error(await readError(res, "Bericht fehlgeschlagen"))
      const { report } = await readJson<{ report: ReportItem }>(res)
      setReports((prev) => prev.map((r) => (r.id === tempId ? report : r)))
    } catch {
      setReports((prev) => prev.map((r) => (r.id === tempId ? { ...r, status: "failed" } : r)))
    }
  }

  async function handleDeleteReport(reportId: string) {
    setReports((prev) => prev.filter((r) => r.id !== reportId))
    if (!reportId.startsWith("temp-")) {
      await fetch(`/api/notebooks/${notebookId}/reports/${reportId}`, { method: "DELETE" })
    }
  }

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
      if (!res.ok) throw new Error(await readError(res, "Audio fehlgeschlagen"))
      const { audio } = await readJson<{ audio: AudioItem }>(res)
      setAudios((prev) => prev.map((a) => (a.id === tempId ? audio : a)))
    } catch {
      setAudios((prev) => prev.map((a) => (a.id === tempId ? { ...a, status: "failed" } : a)))
    }
  }

  async function handleDeleteAudio(audioId: string) {
    setAudios((prev) => prev.filter((a) => a.id !== audioId))
    if (playingAudio?.id === audioId) {
      setPlayingAudio(null)
      setAudioPlaying(false)
    }
    if (!audioId.startsWith("temp-")) {
      await fetch(`/api/notebooks/${notebookId}/audio/${audioId}`, { method: "DELETE" })
    }
  }

  async function handlePlayAudio(audioId: string) {
    if (playingAudio?.id === audioId) {
      setPlayingAudio(null)
      setAudioPlaying(false)
      return
    }
    const res = await fetch(`/api/notebooks/${notebookId}/audio/${audioId}`)
    if (!res.ok) return
    const { audio } = await readJson<{ audio: { title: string; url: string | null } }>(res)
    if (audio.url) setPlayingAudio({ id: audioId, url: audio.url, title: audio.title })
  }

  async function handleCreateVideo(options: VideoOptions) {
    setVideoOpen(false)
    const tempId = `temp-${crypto.randomUUID()}`
    const placeholder: VideoItem = {
      id: tempId,
      format: options.format.id,
      title: options.format.label,
      visualStyle: options.visualStyle.id,
      durationSeconds: null,
      sourceCount: selectedReadyIds.length,
      status: "processing",
      createdAt: new Date().toISOString()
    }
    setVideos((prev) => [placeholder, ...prev])

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: options.format.id,
          language: options.language,
          visualStyle: options.visualStyle.id,
          customStyle: options.customStyle,
          focus: options.focus,
          sourceIds: selectedReadyIds
        })
      })
      if (!res.ok) throw new Error(await readError(res, "Video fehlgeschlagen"))
      const { video } = await readJson<{ video: VideoItem }>(res)
      setVideos((prev) => prev.map((v) => (v.id === tempId ? video : v)))
    } catch {
      setVideos((prev) => prev.map((v) => (v.id === tempId ? { ...v, status: "failed" } : v)))
    }
  }

  async function handleDeleteVideo(videoId: string) {
    setVideos((prev) => prev.filter((v) => v.id !== videoId))
    if (playingVideo?.id === videoId) setPlayingVideo(null)
    if (!videoId.startsWith("temp-")) {
      await fetch(`/api/notebooks/${notebookId}/video/${videoId}`, { method: "DELETE" })
    }
  }

  async function handlePlayVideo(videoId: string) {
    const res = await fetch(`/api/notebooks/${notebookId}/video/${videoId}`)
    if (!res.ok) return
    const { video } = await readJson<{ video: { title: string; url: string | null } }>(res)
    if (video.url) setPlayingVideo({ id: videoId, url: video.url, title: video.title })
  }

  function handleOpenTool(tool: StudioTool) {
    if (tool === "audio") setAudioOpen(true)
    else if (tool === "video") setVideoOpen(true)
    else if (tool === "reports") setReportOpen(true)
    else {
      const format = getStudioFormat(tool)
      if (!format) return
      if (format.hasOptions) setStudioOptions(format)
      else handleCreateStudio(format)
    }
  }

  function handleOpenEntry(kind: StudioEntryKind, id: string) {
    if (kind === "audio") handlePlayAudio(id)
    else if (kind === "video") handlePlayVideo(id)
    else {
      const report = reports.find((r) => r.id === id)
      if (report) setViewReport(report)
    }
  }

  function handleDeleteEntry(kind: StudioEntryKind, id: string) {
    if (kind === "audio") handleDeleteAudio(id)
    else if (kind === "video") handleDeleteVideo(id)
    else handleDeleteReport(id)
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
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, id: evt.messageId, citations: evt.citations } : m)))
          } else if (evt.type === "error") {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}\n\n[Fehler: ${evt.error}]` } : m)))
          }
        }
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}\n\n[Fehler: ${String(err)}]` } : m)))
    } finally {
      setStreaming(false)
      maybeAutoTitle()
    }
  }

  function focusCitation(citation: Citation) {
    setActiveSourceId(citation.sourceId)
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

            <div className={styles.webSearch}>
              <WebSourceSearch notebookId={notebookId} onImport={handleImportSources} />
            </div>

            {sources.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={`material-symbols-outlined ${styles.emptyIcon}`}>description</span>
                <p className={styles.emptyTitle}>Gespeicherte Quellen werden hier angezeigt</p>
                <p className={styles.emptyText}>Klicke oben auf „Quellen hinzufügen“, um PDFs, Websites oder eigene Texte hinzuzufügen.</p>
              </div>
            ) : (
              <>
                <div className={styles.selectAllRow}>
                  <button className={styles.selectAllRefresh} aria-label="Quellen aktualisieren" onClick={() => refreshSources()}>
                    <span className="material-symbols-outlined">refresh</span>
                  </button>
                  <span className={styles.selectAllLabel}>Alle auswählen</span>
                  <button className={styles.checkbox} role="checkbox" aria-checked={allSelected} aria-label="Alle auswählen" onClick={toggleAll}>
                    <span className="material-symbols-outlined">check</span>
                  </button>
                </div>

                <ul className={styles.sourceList}>
                  {sources.map((s) => {
                    const link = s.type === "url" ? s.sourceUrl : null
                    return (
                      <li
                        key={s.id}
                        className={`${styles.sourceItem} ${activeSourceId === s.id ? styles.sourceItemActive : ""}`}
                        title={link ?? undefined}
                        onClick={() => {
                          setActiveSourceId(s.id)
                          if (link) window.open(link, "_blank", "noopener,noreferrer")
                        }}
                      >
                        <SourceIcon type={s.type} url={link} />
                        <span className={styles.sourceTitle}>{s.title}</span>
                        <SourceStatus status={s.status} error={s.error} />
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
                        {s.status === "failed" ? (
                          <button
                            className={styles.sourceRetry}
                            aria-label={`Import von „${s.title}“ wiederholen`}
                            title="Import wiederholen"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRetrySource(s.id)
                            }}
                          >
                            <span className="material-symbols-outlined">refresh</span>
                          </button>
                        ) : (
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
                        )}
                      </li>
                    )
                  })}
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
                Füge links Quellen hinzu und stelle dann unten eine Frage. Antworten werden ausschließlich aus deinen Quellen erzeugt und mit anklickbaren Zitaten
                belegt.
              </p>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((m) => (
                <div key={m.id} className={`${styles.message} ${m.role === "user" ? styles.messageUser : styles.messageAssistant}`}>
                  <div className={styles.messageContent}>
                    {m.role === "assistant" ? (
                      m.content ? (
                        <CitedMarkdown content={m.content} citations={m.citations} sourceTitle={(id) => sourceTitleFor(sources, id)} onSelect={focusCitation} />
                      ) : streaming ? (
                        "…"
                      ) : (
                        ""
                      )
                    ) : (
                      m.content
                    )}
                  </div>
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

          <StudioPanel
            readyCount={readyCount}
            reports={reports}
            audios={audios}
            videos={videos}
            activeAudioId={playingAudio?.id ?? null}
            audioPlaying={audioPlaying}
            onOpenTool={handleOpenTool}
            onOpen={handleOpenEntry}
            onDelete={handleDeleteEntry}
          />

          {playingAudio && (
            <AudioPlayer
              title={playingAudio.title}
              src={playingAudio.url}
              onPlayingChange={setAudioPlaying}
              onClose={() => {
                setPlayingAudio(null)
                setAudioPlaying(false)
              }}
            />
          )}
        </section>
      </div>

      <p className={styles.disclaimer}>NotebookLM kann Fehler machen, überprüfe daher die Antworten.</p>

      {modalOpen && (
        <AddSourceModal
          notebookId={notebookId}
          onClose={() => setModalOpen(false)}
          onAdd={handleAddSource}
          onImportUrls={async (urls) => {
            await handleImportSources(urls)
            setModalOpen(false)
          }}
        />
      )}
      {reportOpen && <ReportModal notebookId={notebookId} sourceIds={selectedReadyIds} onClose={() => setReportOpen(false)} onGenerate={handleCreateReport} />}
      {audioOpen && <AudioModal onClose={() => setAudioOpen(false)} onCreate={handleCreateAudio} />}
      {studioOptions && (
        <StudioOptionsModal format={studioOptions} onClose={() => setStudioOptions(null)} onCreate={(options) => handleCreateStudio(studioOptions, options)} />
      )}
      {videoOpen && <VideoModal onClose={() => setVideoOpen(false)} onCreate={handleCreateVideo} />}
      {viewReport && <ReportViewModal notebookId={notebookId} reportId={viewReport.id} title={viewReport.title} onClose={() => setViewReport(null)} />}
      {playingVideo && <VideoPlayer title={playingVideo.title} src={playingVideo.url} onClose={() => setPlayingVideo(null)} />}
    </div>
  )
}

function sourceTitleFor(sources: SourceItem[], sourceId: string) {
  return sources.find((s) => s.id === sourceId)?.title ?? "Quelle"
}

function SourceIcon({ type, url }: { type: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  const host = url ? hostOf(url) : null

  if (host && !failed) {
    return <img className={styles.sourceFavicon} src={`https://icons.duckduckgo.com/ip3/${host}.ico`} alt="" loading="lazy" onError={() => setFailed(true)} />
  }

  return <span className={`material-symbols-outlined ${styles.sourceIcon}`}>{SOURCE_ICON[type] ?? "description"}</span>
}

function SourceStatus({ status, error }: { status: string; error?: string | null }) {
  if (status === "ready") return null
  if (status === "failed") {
    return (
      <span className={`material-symbols-outlined ${styles.statusFailed}`} title={error || "Verarbeitung fehlgeschlagen"}>
        error
      </span>
    )
  }
  return <span className={`material-symbols-outlined ${styles.statusProcessing}`}>progress_activity</span>
}
