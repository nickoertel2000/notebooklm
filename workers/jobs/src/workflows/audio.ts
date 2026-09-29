import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { audioOverviews } from "@/db/schema"
import { type AudioLength, buildScriptSystemPrompt, getAudioFormat, parseScript } from "@/lib/audio"
import { generateText, reportModels, synthesizeSpeech } from "@/lib/gemini"
import { buildContext } from "@/lib/jobs/context"
import { toErrorMessage } from "@/lib/jobs/errors"
import type { AudioParams } from "@/lib/jobs/types"
import { audioKey, putObject } from "@/lib/storage"
import { API_STEP, DB_STEP } from "./shared"

// Enthält auch die Denk-Tokens von Gemini.
const SCRIPT_MAX_TOKENS: Record<AudioLength, number> = { kurz: 6000, standard: 10000 }

export class AudioWorkflow extends WorkflowEntrypoint<JobsEnv, AudioParams> {
  async run(event: WorkflowEvent<AudioParams>, step: WorkflowStep) {
    const job = event.payload

    try {
      const format = getAudioFormat(job.formatId)
      if (!format) throw new NonRetryableError(`Unbekanntes Audio-Format: ${job.formatId}`)

      const { title, script } = await step.do("script", API_STEP, async () => {
        const context = await buildContext(getDb(), job.notebookId, job.sourceIds)
        const focusLine = job.focus ? `\n\nLege den Fokus auf Folgendes: ${job.focus}` : ""
        const raw = await generateText({
          models: reportModels(),
          system: buildScriptSystemPrompt(format, job.length, job.language),
          prompt: `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nAufgabe: ${format.instruction}${focusLine}`,
          maxOutputTokens: SCRIPT_MAX_TOKENS[job.length]
        })
        const parsed = parseScript(raw, format.label)
        if (!parsed.script) throw new Error("Leeres Skript erzeugt")
        return parsed
      })

      const key = audioKey(job.notebookId, job.audioId)
      const { durationSeconds } = await step.do("synthesize", API_STEP, async () => {
        const { wav, durationSeconds } = await synthesizeSpeech(script, format.speakers)
        await putObject(key, wav, "audio/wav")
        return { durationSeconds }
      })

      await step.do("save", DB_STEP, async () => {
        await getDb().update(audioOverviews).set({ title, storageKey: key, durationSeconds, status: "ready" }).where(eq(audioOverviews.id, job.audioId))
      })
    } catch (err) {
      await step.do("mark-failed", DB_STEP, async () => {
        await getDb()
          .update(audioOverviews)
          .set({ status: "failed", error: toErrorMessage(err) })
          .where(eq(audioOverviews.id, job.audioId))
      })
      throw err
    }
  }
}
