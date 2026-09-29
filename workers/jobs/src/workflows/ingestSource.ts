import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm"
import { extractText } from "unpdf"
import { getDb, type Db } from "@/db"
import { sourceChunks, sources } from "@/db/schema"
import { chunkText } from "@/lib/chunk"
import { stripNul, toErrorMessage } from "@/lib/jobs/errors"
import type { IngestSourceParams } from "@/lib/jobs/types"
import { getObject } from "@/lib/storage"
import { embedTexts } from "@/lib/embeddings"
import { API_STEP, DB_STEP } from "./shared"

const EMBED_BATCH = 100
const INSERT_BATCH = 500

async function assertSourceExists(db: Db, sourceId: string) {
  const [row] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1)
  if (!row) throw new NonRetryableError("Quelle wurde gelöscht")
}

// Import einer Quelle in drei Phasen:
// 1. extract: Text holen, chunken, Chunks ohne Embedding speichern
// 2. embed-n: pro 100er-Batch Embeddings nachtragen (idempotent über embedding IS NULL)
// 3. finalize: Status auf ready
// Solange die Quelle nicht ready ist, sehen Chat und Generierung die Chunks nicht.
export class IngestSourceWorkflow extends WorkflowEntrypoint<JobsEnv, IngestSourceParams> {
  async run(event: WorkflowEvent<IngestSourceParams>, step: WorkflowStep) {
    const { sourceId, key, isPdf } = event.payload

    try {
      const { batches } = await step.do("extract", DB_STEP, async () => {
        const db = getDb()
        await assertSourceExists(db, sourceId)

        const object = await getObject(key)
        if (!object) throw new NonRetryableError("Hochgeladene Datei nicht gefunden")
        const bytes = new Uint8Array(await object.arrayBuffer())

        let text: string
        if (isPdf) {
          const result = await extractText(bytes, { mergePages: true })
          text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text
        } else {
          text = new TextDecoder("utf-8").decode(bytes)
        }
        text = stripNul(text)
        if (!text.trim()) throw new NonRetryableError("Kein Text in der Quelle gefunden")

        const chunks = chunkText(text)
        await db.transaction(async (tx) => {
          await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId))
          for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
            await tx.insert(sourceChunks).values(chunks.slice(i, i + INSERT_BATCH).map((c) => ({ ...c, sourceId, notebookId: event.payload.notebookId })))
          }
          await tx.update(sources).set({ charCount: text.length, updatedAt: new Date() }).where(eq(sources.id, sourceId))
        })

        return { batches: Math.ceil(chunks.length / EMBED_BATCH) }
      })

      for (let batch = 0; batch < batches; batch++) {
        await step.do(`embed-${batch + 1}`, API_STEP, async () => {
          const db = getDb()
          const rows = await db
            .select({ id: sourceChunks.id, content: sourceChunks.content })
            .from(sourceChunks)
            .where(
              and(
                eq(sourceChunks.sourceId, sourceId),
                isNull(sourceChunks.embedding),
                gte(sourceChunks.idx, batch * EMBED_BATCH),
                lt(sourceChunks.idx, (batch + 1) * EMBED_BATCH)
              )
            )
            .orderBy(asc(sourceChunks.idx))
          if (rows.length === 0) return

          const vectors = await embedTexts(
            rows.map((r) => r.content),
            "document"
          )
          const values = sql.join(
            rows.map((r, i) => sql`(${r.id}::uuid, ${JSON.stringify(vectors[i])}::vector)`),
            sql`, `
          )
          await db.execute(
            sql`update ${sourceChunks} set embedding = data.embedding from (values ${values}) as data(id, embedding) where ${sourceChunks.id} = data.id`
          )
        })
      }

      await step.do("finalize", DB_STEP, async () => {
        const db = getDb()
        await assertSourceExists(db, sourceId)
        await db.update(sources).set({ status: "ready", error: null, updatedAt: new Date() }).where(eq(sources.id, sourceId))
      })
    } catch (err) {
      await step.do("mark-failed", DB_STEP, async () => {
        await getDb()
          .update(sources)
          .set({ status: "failed", error: toErrorMessage(err), updatedAt: new Date() })
          .where(eq(sources.id, sourceId))
      })
      throw err
    }
  }
}
