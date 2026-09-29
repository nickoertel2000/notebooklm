import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { reports } from "@/db/schema"
import { generateText, reportModels } from "@/lib/gemini"
import { buildContext } from "@/lib/jobs/context"
import { toErrorMessage } from "@/lib/jobs/errors"
import type { ReportParams } from "@/lib/jobs/types"
import { buildReportSystemPrompt, deriveReportTitle } from "@/lib/reports"
import { parseStudioContent, STUDIO_SCHEMAS, STUDIO_SYSTEM_PROMPT } from "@/lib/studio"
import { API_STEP, DB_STEP } from "./shared"

export class ReportWorkflow extends WorkflowEntrypoint<JobsEnv, ReportParams> {
  async run(event: WorkflowEvent<ReportParams>, step: WorkflowStep) {
    const job = event.payload

    try {
      const report = await step.do("generate", API_STEP, async () => {
        const context = await buildContext(getDb(), job.notebookId, job.sourceIds)
        const prompt = `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nAufgabe: ${job.instruction}`

        if (job.format) {
          const raw = await generateText({
            models: reportModels(),
            system: STUDIO_SYSTEM_PROMPT,
            prompt,
            maxOutputTokens: 16000,
            jsonSchema: STUDIO_SCHEMAS[job.format]
          })
          const parsed = parseStudioContent(job.format, raw)
          // Wirft, damit der Step mit einer neuen Antwort wiederholt wird.
          if (!parsed) throw new Error("Die KI hat kein gültiges Ergebnis geliefert")
          return { title: parsed.data.title || job.reportLabel, content: JSON.stringify(parsed.data) }
        }

        const content = await generateText({
          models: reportModels(),
          system: buildReportSystemPrompt(job.language),
          prompt,
          maxOutputTokens: 8000
        })
        return { title: deriveReportTitle(content, job.reportLabel), content }
      })

      await step.do("save", DB_STEP, async () => {
        await getDb()
          .update(reports)
          .set({ ...report, status: "ready" })
          .where(eq(reports.id, job.reportId))
      })
    } catch (err) {
      await step.do("mark-failed", DB_STEP, async () => {
        await getDb()
          .update(reports)
          .set({ status: "failed", error: toErrorMessage(err) })
          .where(eq(reports.id, job.reportId))
      })
      throw err
    }
  }
}
