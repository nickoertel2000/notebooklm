import { env } from "cloudflare:workers"
import type { AudioParams, IngestSourceParams, ReportParams, VideoParams } from "./types"

// Instanz-ID = ID der DB-Zeile, damit cancelJob die Instanz findet. Quellen lassen sich
// erneut importieren und Instanz-IDs sind pro Workflow eindeutig, daher dort mit Zeitstempel.

export function startIngestSource(params: IngestSourceParams) {
  return env.INGEST_SOURCE_WORKFLOW.create({ id: `${params.sourceId}-${Date.now()}`, params })
}

export function startReport(params: ReportParams) {
  return env.REPORT_WORKFLOW.create({ id: params.reportId, params })
}

export function startAudio(params: AudioParams) {
  return env.AUDIO_WORKFLOW.create({ id: params.audioId, params })
}

export function startVideo(params: VideoParams) {
  return env.VIDEO_WORKFLOW.create({ id: params.videoId, params })
}

const workflows = {
  report: () => env.REPORT_WORKFLOW,
  audio: () => env.AUDIO_WORKFLOW,
  video: () => env.VIDEO_WORKFLOW
}

export async function cancelJob(kind: keyof typeof workflows, id: string) {
  try {
    const instance = await workflows[kind]().get(id)
    await instance.terminate()
  } catch {
    // Fertige oder nie gestartete Instanzen werfen, beim Löschen egal.
  }
}
