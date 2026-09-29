import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { getDb } from "@/db"
import { reports } from "@/db/schema"
import { getAnthropic, reportModel } from "@/lib/anthropic"
import { buildContext } from "@/lib/jobs/context"
import { toErrorMessage } from "@/lib/jobs/errors"
import type { ReportParams } from "@/lib/jobs/types"
import { buildReportSystemPrompt, deriveReportTitle } from "@/lib/reports"
import { API_STEP, DB_STEP, joinText } from "./shared"

export class ReportWorkflow extends WorkflowEntrypoint<JobsEnv, ReportParams> {
  async run(event: WorkflowEvent<ReportParams>, step: WorkflowStep) {
    const job = event.payload

    try {
      const report = await step.do("generate", API_STEP, async () => {
        const context = await buildContext(getDb(), job.notebookId, job.sourceIds)
        const message = await getAnthropic().messages.create({
          model: reportModel(),
          max_tokens: 8000,
          system: buildReportSystemPrompt(job.language),
          messages: [{ role: "user", content: `Hier sind die Quellen des Notebooks:\n${context}\n\n---\n\nAufgabe: ${job.instruction}` }]
        })
        const content = joinText(message.content)
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
