"use client"

import AudioPlayer from "@/components/AudioPlayer/AudioPlayer"
import { useNotebookTitle } from "@/components/NotebookHeader/NotebookTitleContext"
import StudioPanel, { StudioEntryKind, StudioTool } from "@/components/StudioPanel/StudioPanel"
import Toast from "@/components/Toast/Toast"
import VideoPlayer from "@/components/VideoPlayer/VideoPlayer"
import AddSourceModal, { AddSourcePayload } from "@/components/popup/AddSourceModal"
import AudioModal, { AudioOptions } from "@/components/popup/AudioModal"
import ReportModal, { ReportGeneratePayload } from "@/components/popup/ReportModal"
import ReportViewModal from "@/components/popup/ReportViewModal"
import StudioOptionsModal from "@/components/popup/StudioOptionsModal"
import VideoModal, { VideoOptions } from "@/components/popup/VideoModal"
import { readJson } from "@/lib/api/client"
import type { AudioItem, ChatMessage, ReportItem, SourceItem, VideoItem } from "@/lib/items"
import { DEFAULT_NOTEBOOK_TITLE } from "@/lib/notebookTitle"
import { getReportType } from "@/lib/reports"
import { getStudioFormat, StudioFormat, StudioOptions } from "@/lib/studio"
import { useRef, useState } from "react"
import styles from "../notebook.module.scss"
import ChatPanel from "./ChatPanel"
import SourcesPanel from "./SourcesPanel"
import { useChatStream } from "./useChatStream"
import { useSources } from "./useSources"
import { useStudioJobs } from "./useStudioJobs"

type Media = { id: string; url: string; title: string }

// Welcher Dialog offen ist. Es ist immer höchstens einer.
type Dialog =
  | { kind: "addSource" }
  | { kind: "report" }
  | { kind: "audio" }
  | { kind: "video" }
  | { kind: "studioOptions"; format: StudioFormat }
  | { kind: "viewReport"; report: ReportItem }
  | { kind: "playVideo"; video: Media }

type Props = {
  notebookId: string
  initialSources: SourceItem[]
  initialMessages: ChatMessage[]
  initialReports: ReportItem[]
  initialAudios: AudioItem[]
  initialVideos: VideoItem[]
}

export default function NotebookView({ notebookId, initialSources, initialMessages, initialReports, initialAudios, initialVideos }: Props) {
  const api = `/api/notebooks/${notebookId}`
  const notebookTitle = useNotebookTitle()
  const autoTitlingRef = useRef(false)
  const [dialog, setDialog] = useState<Dialog | null>(initialSources.length === 0 ? { kind: "addSource" } : null)
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null)
  const [playingAudio, setPlayingAudio] = useState<Media | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const showError = (message: string) => setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message }))
  const closeDialog = () => setDialog(null)

  const sources = useSources(notebookId, initialSources, { onError: showError, onAdded: maybeAutoTitle })
  const chat = useChatStream(notebookId, initialMessages, maybeAutoTitle)
  const reports = useStudioJobs({ url: `${api}/reports`, listKey: "reports", itemKey: "report", pollMs: 3000, initial: initialReports, onError: showError })
  const audios = useStudioJobs({ url: `${api}/audio`, listKey: "audios", itemKey: "audio", pollMs: 4000, initial: initialAudios, onError: showError })
  const videos = useStudioJobs({ url: `${api}/video`, listKey: "videos", itemKey: "video", pollMs: 5000, initial: initialVideos, onError: showError })
  const sourceIds = sources.selectedReadyIds

  // Fehler bleiben still: Der Titel ist ein Komfort und lässt sich jederzeit von Hand setzen.
  async function maybeAutoTitle() {
    if (notebookTitle.title !== DEFAULT_NOTEBOOK_TITLE || autoTitlingRef.current) return
    autoTitlingRef.current = true
    try {
      const res = await fetch(`${api}/auto-title`, { method: "POST" })
      if (!res.ok) return
      const data = await readJson<{ title?: string; emoji?: string | null; generated: boolean }>(res)
      if (data.generated && data.title) notebookTitle.setTitle(data.title, data.emoji)
    } catch {
      // siehe oben
    } finally {
      autoTitlingRef.current = false
    }
  }

  async function addSource(payload: AddSourcePayload) {
    await sources.add(payload)
    closeDialog()
  }

  function startReport(body: object, type: string, title: string) {
    closeDialog()
    reports.create({ type, title, sourceCount: sourceIds.length }, { ...body, sourceIds }, "Bericht fehlgeschlagen")
  }

  function createReport(payload: ReportGeneratePayload) {
    const title = payload.type ? (getReportType(payload.type)?.label ?? "Bericht") : (payload.title ?? "Eigener Bericht")
    startReport(payload, payload.type ?? "custom", title)
  }

  function createStudioFormat(format: StudioFormat, options?: StudioOptions) {
    startReport({ format: format.id, ...options }, format.id, format.label)
  }

  function createAudio(options: AudioOptions) {
    closeDialog()
    audios.create(
      { format: options.format.id, title: options.format.label, durationSeconds: null, sourceCount: sourceIds.length },
      { format: options.format.id, length: options.length, language: options.language, focus: options.focus, sourceIds },
      "Audio fehlgeschlagen"
    )
  }

  function createVideo(options: VideoOptions) {
    closeDialog()
    videos.create(
      { format: options.format.id, title: options.format.label, visualStyle: options.visualStyle.id, durationSeconds: null, sourceCount: sourceIds.length },
      {
        format: options.format.id,
        language: options.language,
        visualStyle: options.visualStyle.id,
        customStyle: options.customStyle,
        focus: options.focus,
        sourceIds
      },
      "Video fehlgeschlagen"
    )
  }

  async function loadMedia(kind: "audio" | "video", id: string): Promise<Media | null> {
    const failure = kind === "audio" ? "Die Audio-Übersicht konnte nicht geladen werden." : "Die Video-Übersicht konnte nicht geladen werden."
    const res = await fetch(`${api}/${kind}/${id}`).catch(() => null)
    if (!res?.ok) {
      showError(failure)
      return null
    }
    const media = (await readJson<Record<string, { title: string; url: string | null }>>(res))[kind]
    return media.url ? { id, url: media.url, title: media.title } : null
  }

  function stopAudio() {
    setPlayingAudio(null)
    setAudioPlaying(false)
  }

  async function toggleAudio(id: string) {
    if (playingAudio?.id === id) return stopAudio()
    const media = await loadMedia("audio", id)
    if (media) setPlayingAudio(media)
  }

  async function playVideo(id: string) {
    const media = await loadMedia("video", id)
    if (media) setDialog({ kind: "playVideo", video: media })
  }

  function openTool(tool: StudioTool) {
    if (tool === "audio" || tool === "video" || tool === "reports") {
      setDialog({ kind: tool === "reports" ? "report" : tool })
      return
    }
    const format = getStudioFormat(tool)
    if (!format) return
    if (format.hasOptions) setDialog({ kind: "studioOptions", format })
    else createStudioFormat(format)
  }

  function openEntry(kind: StudioEntryKind, id: string) {
    if (kind === "audio") toggleAudio(id)
    else if (kind === "video") playVideo(id)
    else {
      const report = reports.items.find((r) => r.id === id)
      if (report) setDialog({ kind: "viewReport", report })
    }
  }

  function deleteEntry(kind: StudioEntryKind, id: string) {
    if (kind === "audio") {
      if (playingAudio?.id === id) stopAudio()
      audios.remove(id, "Die Audio-Übersicht konnte nicht gelöscht werden.")
    } else if (kind === "video") {
      if (dialog?.kind === "playVideo" && dialog.video.id === id) closeDialog()
      videos.remove(id, "Die Video-Übersicht konnte nicht gelöscht werden.")
    } else {
      reports.remove(id, "Der Eintrag konnte nicht gelöscht werden.")
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.columns}>
        <SourcesPanel
          notebookId={notebookId}
          sources={sources}
          activeSourceId={activeSourceId}
          onActivate={setActiveSourceId}
          onOpenAddDialog={() => setDialog({ kind: "addSource" })}
        />

        <ChatPanel
          messages={chat.messages}
          streaming={chat.streaming}
          readyCount={sourceIds.length}
          sourceTitle={(id) => sources.sources.find((s) => s.id === id)?.title ?? "Quelle"}
          onSend={(text) => chat.send(text, sourceIds)}
          onStop={chat.stop}
          onCitation={(citation) => setActiveSourceId(citation.sourceId)}
        />

        <section className={`${styles.panel} ${styles.studio}`}>
          <header className={styles.panelHeader}>
            <h2>Studio</h2>
          </header>

          <StudioPanel
            readyCount={sourceIds.length}
            reports={reports.items}
            audios={audios.items}
            videos={videos.items}
            activeAudioId={playingAudio?.id ?? null}
            audioPlaying={audioPlaying}
            onOpenTool={openTool}
            onOpen={openEntry}
            onDelete={deleteEntry}
          />

          {playingAudio && <AudioPlayer title={playingAudio.title} src={playingAudio.url} onPlayingChange={setAudioPlaying} onClose={stopAudio} />}
        </section>
      </div>

      <p className={styles.disclaimer}>NotebookLM kann Fehler machen, überprüfe daher die Antworten.</p>

      {dialog?.kind === "addSource" && (
        <AddSourceModal
          notebookId={notebookId}
          onClose={closeDialog}
          onAdd={addSource}
          onImportUrls={async (urls) => {
            await sources.importUrls(urls)
            closeDialog()
          }}
        />
      )}
      {dialog?.kind === "report" && <ReportModal notebookId={notebookId} onClose={closeDialog} onGenerate={createReport} />}
      {dialog?.kind === "audio" && <AudioModal onClose={closeDialog} onCreate={createAudio} />}
      {dialog?.kind === "video" && <VideoModal onClose={closeDialog} onCreate={createVideo} />}
      {dialog?.kind === "studioOptions" && (
        <StudioOptionsModal format={dialog.format} onClose={closeDialog} onCreate={(options) => createStudioFormat(dialog.format, options)} />
      )}
      {dialog?.kind === "viewReport" && <ReportViewModal notebookId={notebookId} reportId={dialog.report.id} title={dialog.report.title} onClose={closeDialog} />}
      {dialog?.kind === "playVideo" && <VideoPlayer title={dialog.video.title} src={dialog.video.url} onClose={closeDialog} />}
      {toast && <Toast key={toast.id} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  )
}
