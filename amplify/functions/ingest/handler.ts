import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { S3Handler } from "aws-lambda"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { extractText } from "unpdf"
import * as schema from "../../../db/schema"
import { chunkText } from "../../../lib/chunk"
import { embedTexts } from "../../../lib/voyage"

const s3 = new S3Client({})
// Supabase-Pooler: prepared statements deaktivieren.
const sql = postgres(process.env.DATABASE_URL as string, { prepare: false })
const db = drizzle(sql, { schema })

const EMBED_BATCH = 100

// PostgreSQL erlaubt keine NUL-Bytes (0x00) in text-Spalten — PDFs enthalten die
// aber häufig. Vor jedem DB-Write entfernen, sonst Fehler 22021.
const NUL = String.fromCharCode(0)
const stripNul = (s: string) => s.split(NUL).join("")

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "))
    // Key-Schema: notebooks/{notebookId}/sources/{sourceId}/{filename}
    const parts = key.split("/")
    const notebookId = parts[1]
    const sourceId = parts[3]
    const filename = parts[4] ?? ""
    if (!notebookId || !sourceId) continue

    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const bytes = await obj.Body!.transformToByteArray()

      let text: string
      if (filename.toLowerCase().endsWith(".pdf")) {
        const result = await extractText(new Uint8Array(bytes), { mergePages: true })
        text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text
      } else {
        text = new TextDecoder("utf-8").decode(bytes)
      }

      text = stripNul(text)

      const chunks = chunkText(text)

      const rows: (typeof schema.sourceChunks.$inferInsert)[] = []
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH)
        const vectors = await embedTexts(
          batch.map((c) => c.content),
          "document"
        )
        batch.forEach((c, j) => {
          rows.push({
            sourceId,
            notebookId,
            idx: c.idx,
            content: c.content,
            embedding: vectors[j],
            page: c.page,
            charStart: c.charStart,
            charEnd: c.charEnd
          })
        })
      }

      if (rows.length > 0) {
        await db.insert(schema.sourceChunks).values(rows)
      }

      await db
        .update(schema.sources)
        .set({ status: "ready", charCount: text.length, updatedAt: new Date() })
        .where(eq(schema.sources.id, sourceId))
    } catch (err) {
      console.error("Ingestion fehlgeschlagen für", key, err)
      // stripNul auch hier: die Fehlermeldung kann den NUL-Text enthalten und würde
      // sonst den failed-Status-Write selbst scheitern lassen.
      await db
        .update(schema.sources)
        .set({ status: "failed", error: stripNul(String(err)).slice(0, 500), updatedAt: new Date() })
        .where(eq(schema.sources.id, sourceId))
    }
  }
}
