"use client"

import { useEffect, useState } from "react"
import "material-symbols"
import type { AudioItem, ReportItem, VideoItem } from "@/lib/items"
import { getAudioFormat } from "@/lib/audio"
import { getReportType } from "@/lib/reports"
import { getStudioFormat, STUDIO_FORMATS, StudioFormatId } from "@/lib/studio"
import { getVideoFormat } from "@/lib/video"
import styles from "./StudioPanel.module.scss"

export type StudioTool = "audio" | "video" | "reports" | StudioFormatId

type Tool = { id: StudioTool; label: string; icon: string; tint: string }

const TINTS: Record<StudioTool, string> = {
  audio: "#8ab4f8",
  video: "#81c995",
  mindmap: "#c58af9",
  reports: "#f48fb1",
  flashcards: "#fdd663",
  quiz: "#78d9ec",
  table: "#7cacf8"
}

const studioTool = (id: StudioFormatId): Tool => {
  const format = STUDIO_FORMATS.find((f) => f.id === id)!
  return { id, label: format.label, icon: format.icon, tint: TINTS[id] }
}

const TOOLS: Tool[] = [
  { id: "audio", label: "Audio-Übersicht", icon: "graphic_eq", tint: TINTS.audio },
  { id: "video", label: "Videoübersicht", icon: "videocam", tint: TINTS.video },
  studioTool("mindmap"),
  { id: "reports", label: "Berichte", icon: "summarize", tint: TINTS.reports },
  studioTool("flashcards"),
  studioTool("quiz"),
  studioTool("table")
]

const toolIcon = (id: StudioTool) => TOOLS.find((t) => t.id === id)!.icon

export type StudioEntryKind = "audio" | "video" | "report"

type Entry = {
  kind: StudioEntryKind
  id: string
  icon: string
  tint: string
  title: string
  meta: string
  status: string
  createdAt: string
}

type StudioPanelProps = {
  readyCount: number
  reports: ReportItem[]
  audios: AudioItem[]
  videos: VideoItem[]
  activeAudioId: string | null
  audioPlaying: boolean
  onOpenTool: (tool: StudioTool) => void
  onOpen: (kind: StudioEntryKind, id: string) => void
  onDelete: (kind: StudioEntryKind, id: string) => void
}

export default function StudioPanel({ readyCount, reports, audios, videos, activeAudioId, audioPlaying, onOpenTool, onOpen, onDelete }: StudioPanelProps) {
  const [menuKey, setMenuKey] = useState<string | null>(null)

  useEffect(() => {
    if (!menuKey) return
    const close = () => setMenuKey(null)
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [menuKey])

  const entries: Entry[] = [
    ...videos.map((v) => ({
      kind: "video" as const,
      id: v.id,
      icon: toolIcon("video"),
      tint: TINTS.video,
      title: v.title,
      meta: metaLine(v, getVideoFormat(v.format)?.label ?? "Video", v.durationSeconds),
      status: v.status,
      createdAt: v.createdAt
    })),
    ...audios.map((a) => ({
      kind: "audio" as const,
      id: a.id,
      icon: activeAudioId === a.id ? (audioPlaying ? "pause_circle" : "play_circle") : toolIcon("audio"),
      tint: TINTS.audio,
      title: a.title,
      meta: metaLine(a, getAudioFormat(a.format)?.label ?? "Audio", a.durationSeconds),
      status: a.status,
      createdAt: a.createdAt
    })),
    ...reports.map((r) => {
      const format = getStudioFormat(r.type)
      const reportType = getReportType(r.type)
      return {
        kind: "report" as const,
        id: r.id,
        icon: format?.icon ?? reportType?.icon ?? "description",
        tint: format ? TINTS[format.id] : TINTS.reports,
        title: r.title,
        meta: metaLine(r, format?.label ?? reportType?.metaLabel ?? "Bericht", null),
        status: r.status,
        createdAt: r.createdAt
      }
    })
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className={styles.body}>
      <div className={styles.grid}>
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={styles.tile}
            style={{ "--tint": tool.tint } as React.CSSProperties}
            disabled={readyCount === 0}
            title={readyCount === 0 ? "Zuerst Quellen auswählen" : undefined}
            onClick={() => onOpenTool(tool.id)}
          >
            <span className={`material-symbols-outlined ${styles.tileIcon}`}>{tool.icon}</span>
            <span className={styles.tileLabel}>{tool.label}</span>
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          <span className={`material-symbols-outlined ${styles.emptyIcon}`}>auto_awesome</span>
          <p className={styles.emptyTitle}>Hier wird die Ausgabe von Studio gespeichert.</p>
          <p className={styles.emptyText}>
            Nachdem du Quellen hinzugefügt hast, klicke auf eine Kachel, um Audio-Übersichten, Karteikarten, Mindmaps und mehr zu erstellen.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => {
            const processing = e.status === "processing"
            const failed = e.status === "failed"
            const key = `${e.kind}:${e.id}`
            return (
              <li
                key={key}
                className={`${styles.item} ${processing || failed ? styles.itemInactive : ""}`}
                style={{ "--tint": e.tint } as React.CSSProperties}
                onClick={() => !processing && !failed && onOpen(e.kind, e.id)}
              >
                <span className={`material-symbols-outlined ${styles.itemIcon} ${processing ? styles.itemIconBusy : ""} ${failed ? styles.itemIconFailed : ""}`}>
                  {processing ? "autorenew" : failed ? "error" : e.icon}
                </span>
                <div className={styles.itemText}>
                  <p className={styles.itemTitle}>{processing ? "Wird erstellt…" : failed ? "Erstellung fehlgeschlagen" : e.title}</p>
                  <p className={styles.itemMeta}>{e.meta}</p>
                </div>

                {!processing && (
                  <div className={styles.menuWrap} onClick={(ev) => ev.stopPropagation()}>
                    <button type="button" className={styles.menuBtn} aria-label="Optionen" onClick={() => setMenuKey((cur) => (cur === key ? null : key))}>
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                    {menuKey === key && (
                      <div className={styles.menu} role="menu">
                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => {
                            setMenuKey(null)
                            onDelete(e.kind, e.id)
                          }}
                        >
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
  )
}

function metaLine(item: { sourceCount: number; status: string; createdAt: string }, label: string, durationSeconds: number | null): string {
  const sources = `${item.sourceCount} ${item.sourceCount === 1 ? "Quelle" : "Quellen"}`
  if (item.status === "processing") return `${label} · basierend auf ${sources}`
  return [label, sources, durationSeconds ? formatDuration(durationSeconds) : null, relativeTime(item.createdAt)].filter(Boolean).join(" · ")
}

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")} Min.`
}
