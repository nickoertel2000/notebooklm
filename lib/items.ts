// Typen der Einträge, die Seite, API-Routen und Client Components teilen. Ohne Server-Imports,
// weil Client Components diese Datei importieren.

export type JobStatus = "processing" | "ready" | "failed"
export type SourceType = "pdf" | "url" | "text"
export type MessageRole = "user" | "assistant"

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
  role: MessageRole
  content: string
  citations: Citation[] | null
}

export type SourceItem = {
  id: string
  type: SourceType
  title: string
  status: JobStatus
  error: string | null
  sourceUrl: string | null
  createdAt: string
}

export type ReportItem = {
  id: string
  type: string
  title: string
  sourceCount: number
  status: JobStatus
  createdAt: string
}

export type AudioItem = {
  id: string
  format: string
  title: string
  durationSeconds: number | null
  sourceCount: number
  status: JobStatus
  createdAt: string
}

export type VideoItem = {
  id: string
  format: string
  title: string
  visualStyle: string
  durationSeconds: number | null
  sourceCount: number
  status: JobStatus
  createdAt: string
}

export type ReportSuggestion = { title: string; description: string; prompt: string }
