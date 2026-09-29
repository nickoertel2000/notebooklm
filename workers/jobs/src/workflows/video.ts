import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { videoOverviews } from "@/db/schema"
import { getAnthropic, reportModel } from "@/lib/anthropic"
import { generateImage, synthesizeSpeech } from "@/lib/gemini"
import { buildContext } from "@/lib/jobs/context"
import { toErrorMessage } from "@/lib/jobs/errors"
import type { VideoParams } from "@/lib/jobs/types"
import { deleteByPrefix, getObject, putObject, videoKey, videoPartsPrefix } from "@/lib/storage"
import {
  buildSlideImagePrompt,
  buildVideoScriptSystemPrompt,
  getVideoFormat,
  getVisualStyle,
  layoutSlide,
  parseVideoScript,
  SLIDE_HEIGHT,
  SLIDE_WIDTH
} from "@/lib/video"
import { API_STEP, DB_STEP, joinText } from "./shared"

// Gemini TTS liefert 24 kHz, 16 bit, mono hinter einem 44-Byte-WAV-Header.
const wavSeconds = (wav: Uint8Array) => Math.max(0, wav.length - 44) / (24000 * 2)

export class VideoWorkflow extends WorkflowEntrypoint<JobsEnv, VideoParams> {
  async run(event: WorkflowEvent<VideoParams>, step: WorkflowStep) {
    const job = event.payload
    const parts = videoPartsPrefix(job.notebookId, job.videoId)

    try {
      const format = getVideoFormat(job.formatId)
      if (!format) throw new NonRetryableError(`Unbekanntes Video-Format: ${job.formatId}`)
      const style = getVisualStyle(job.visualStyleId)
      if (!style) throw new NonRetryableError(`Unbekannter visueller Stil: ${job.visualStyleId}`)

      const { title, segments } = await step.do("script", API_STEP, async () => {
        const context = await buildContext(getDb(), job.notebookId, job.sourceIds)
        const message = await getAnthropic().messages.create({
          model: reportModel(),
          max_tokens: 4000,
          system: buildVideoScriptSystemPrompt(format, job.language, job.focus),
          messages: [{ role: "user", content: `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nErzeuge daraus eine Video-Übersicht.` }]
        })
        const script = parseVideoScript(joinText(message.content))
        if (script.segments.length === 0) throw new Error("Skript ohne Folien erzeugt")
        return script
      })

      // Pro Folie ein eigener Step (Vertonung + Hintergrund parallel), damit ein
      // Rate-Limit nur diese Folie wiederholt. Gruppenweise, um Gemini nicht zu fluten.
      const concurrency = Math.max(1, Number(this.env.VIDEO_SLIDE_CONCURRENCY) || 3)
      const slides: { hasBackground: boolean; seconds: number }[] = []
      for (let start = 0; start < segments.length; start += concurrency) {
        const group = segments.slice(start, start + concurrency).map((segment, offset) => {
          const i = start + offset
          return step.do(`slide-${i + 1}`, API_STEP, async () => {
            const [speech, background] = await Promise.all([
              synthesizeSpeech(segment.narration, 1),
              // Ohne Bild fällt die Folie auf einen einfarbigen Hintergrund zurück.
              generateImage(buildSlideImagePrompt(style, job.customStyle, segment)).catch((err) => {
                console.error(`Folien-Bild ${i + 1} fehlgeschlagen:`, toErrorMessage(err))
                return null
              })
            ])
            await putObject(`${parts}${i}.wav`, speech.wav, "audio/wav")
            if (background) await putObject(`${parts}${i}.png`, background, "image/png")
            return { hasBackground: background !== null, seconds: wavSeconds(speech.wav) }
          })
        })
        slides.push(...(await Promise.all(group)))
      }

      const key = videoKey(job.notebookId, job.videoId)
      await step.do("render", { ...API_STEP, retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" }, async () => {
        const manifest = {
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          slides: segments.map((segment, i) => ({ ...layoutSlide(segment, i, segments.length), hasBackground: slides[i].hasBackground }))
        }
        const form = new FormData()
        form.append("manifest", JSON.stringify(manifest))
        for (const [i, slide] of slides.entries()) {
          const audio = await getObject(`${parts}${i}.wav`)
          if (!audio) throw new Error(`Vertonung für Folie ${i + 1} fehlt`)
          form.append(`audio-${i}`, new File([await audio.arrayBuffer()], `slide${i}.wav`, { type: "audio/wav" }))
          if (slide.hasBackground) {
            const image = await getObject(`${parts}${i}.png`)
            if (!image) throw new Error(`Hintergrund für Folie ${i + 1} fehlt`)
            form.append(`background-${i}`, new File([await image.arrayBuffer()], `slide${i}.png`, { type: "image/png" }))
          }
        }

        const res = await this.env.VIDEO_RENDERER.getByName(job.videoId).fetch("http://video-renderer/render", { method: "POST", body: form })
        if (!res.ok || !res.body) throw new Error(`Video-Renderer ${res.status}: ${await res.text()}`)

        // R2 braucht bei Streams die Länge vorab.
        const length = Number(res.headers.get("content-length"))
        if (!length) throw new Error("Video-Renderer lieferte keine Content-Length")
        const { readable, writable } = new FixedLengthStream(length)
        await Promise.all([res.body.pipeTo(writable), putObject(key, readable, "video/mp4")])
      })

      await step.do("save", DB_STEP, async () => {
        const durationSeconds = Math.round(slides.reduce((sum, s) => sum + s.seconds, 0))
        await getDb().update(videoOverviews).set({ title, storageKey: key, durationSeconds, status: "ready" }).where(eq(videoOverviews.id, job.videoId))
      })
    } catch (err) {
      await step.do("mark-failed", DB_STEP, async () => {
        await getDb()
          .update(videoOverviews)
          .set({ status: "failed", error: toErrorMessage(err) })
          .where(eq(videoOverviews.id, job.videoId))
      })
      throw err
    } finally {
      await step.do("cleanup", DB_STEP, () => deleteByPrefix(parts))
    }
  }
}
