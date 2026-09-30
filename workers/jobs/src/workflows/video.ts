import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { and, count, eq, gte, ne, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { videoOverviews } from "@/db/schema"
import { generateText, reportModels, synthesizeSpeech } from "@/lib/gemini"
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
  MAX_SLIDES,
  parseVideoScript,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type SlideBackground
} from "@/lib/video"
import { generateSlideImage } from "../images"
import { API_STEP, DB_STEP } from "./shared"

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
        const raw = await generateText({
          models: reportModels(),
          system: buildVideoScriptSystemPrompt(format, job.language, job.focus),
          prompt: `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nErzeuge daraus eine Video-Übersicht.`,
          // Enthält auch die Denk-Tokens von Gemini.
          maxOutputTokens: 10000
        })
        const script = parseVideoScript(raw)
        if (script.segments.length === 0) throw new Error("Skript ohne Folien erzeugt")
        return script
      })

      const withImages = await step.do("image-budget", DB_STEP, async () => {
        const [row] = await getDb()
          .select({ n: count() })
          .from(videoOverviews)
          .where(and(ne(videoOverviews.id, job.videoId), gte(videoOverviews.createdAt, sql`date_trunc('day', now() at time zone 'UTC')`)))
        return row.n * MAX_SLIDES + segments.length <= Number(this.env.IMAGE_DAILY_LIMIT)
      })

      // Vertonung zuerst: Das TTS-Kontingent ist das knappste, so verbraucht ein Abbruch
      // dort keine Bild-Neuronen. Die Pause hält die Grenze von 3 TTS-Anfragen pro Minute ein.
      const seconds: number[] = []
      for (const [i, segment] of segments.entries()) {
        if (i > 0) await step.sleep(`speech-pause-${i}`, "20 seconds")
        seconds.push(
          await step.do(`speech-${i + 1}`, API_STEP, async () => {
            const speech = await synthesizeSpeech(segment.narration, 1)
            await putObject(`${parts}${i}.wav`, speech.wav, "audio/wav")
            return wavSeconds(speech.wav)
          })
        )
      }

      // Ein Step pro Folie, damit ein Fehler nur diese Folie wiederholt; gruppenweise, um die API nicht zu fluten.
      const concurrency = Math.max(1, Number(this.env.VIDEO_SLIDE_CONCURRENCY) || 3)
      const backgrounds: SlideBackground[] = []
      for (let start = 0; start < segments.length; start += concurrency) {
        const group = segments.slice(start, start + concurrency).map((segment, offset) => {
          const i = start + offset
          return step.do(`image-${i + 1}`, API_STEP, async () => {
            if (!withImages) return null
            // Ohne Bild fällt die Folie auf einen einfarbigen Hintergrund zurück.
            const image = await generateSlideImage(this.env.AI, this.env.IMAGE_MODEL, buildSlideImagePrompt(style, job.customStyle, segment)).catch((err) => {
              console.error(`Folien-Bild ${i + 1} fehlgeschlagen:`, toErrorMessage(err))
              return null
            })
            if (!image) return null
            await putObject(`${parts}${i}.${image.format}`, image.bytes, `image/${image.format === "jpg" ? "jpeg" : image.format}`)
            return image.format
          })
        })
        backgrounds.push(...(await Promise.all(group)))
      }
      const slides = segments.map((_, i) => ({ background: backgrounds[i], seconds: seconds[i] }))

      const key = videoKey(job.notebookId, job.videoId)
      await step.do("render", { ...API_STEP, retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" }, async () => {
        const manifest = {
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          slides: segments.map((segment, i) => ({ ...layoutSlide(segment, i, segments.length), background: slides[i].background, seconds: slides[i].seconds }))
        }
        const form = new FormData()
        form.append("manifest", JSON.stringify(manifest))
        for (const [i, slide] of slides.entries()) {
          const audio = await getObject(`${parts}${i}.wav`)
          if (!audio) throw new Error(`Vertonung für Folie ${i + 1} fehlt`)
          form.append(`audio-${i}`, new File([await audio.arrayBuffer()], `slide${i}.wav`, { type: "audio/wav" }))
          if (slide.background) {
            const image = await getObject(`${parts}${i}.${slide.background}`)
            if (!image) throw new Error(`Hintergrund für Folie ${i + 1} fehlt`)
            form.append(`background-${i}`, new File([await image.arrayBuffer()], `slide${i}.${slide.background}`))
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
