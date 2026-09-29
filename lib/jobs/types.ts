import type { AudioLength } from "@/lib/audio"
import type { StudioFormatId } from "@/lib/studio"

// Parameter der Workflow-Instanzen. Die App erzeugt sie (lib/jobs/start.ts), der
// Jobs-Worker (workers/jobs) verarbeitet sie. Sie werden von Workflows persistiert,
// deshalb nur JSON-serialisierbare Werte.

export type IngestSourceParams = {
  sourceId: string
  notebookId: string
  key: string
  isPdf: boolean
}

export type ReportParams = {
  reportId: string
  notebookId: string
  instruction: string
  reportLabel: string
  language?: string
  // Gesetzt bei Lernformaten (lib/studio.ts): Antwort als JSON statt Markdown.
  format?: StudioFormatId
  sourceIds: string[] | null
}

export type AudioParams = {
  audioId: string
  notebookId: string
  formatId: string
  length: AudioLength
  language: string
  focus: string | null
  sourceIds: string[] | null
}

export type VideoParams = {
  videoId: string
  notebookId: string
  formatId: string
  visualStyleId: string
  customStyle: string | null
  language: string
  focus: string | null
  sourceIds: string[] | null
}
