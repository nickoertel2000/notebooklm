/**
 * Lokaler Ersatz für den S3-getriggerten ingest-Lambda. In der Cloud verarbeitet
 * AWS den Worker per S3-Event; lokal (pnpm dev) gibt es das nicht — die Job-Datei
 * landet zwar in S3, wird aber von niemandem abgearbeitet, und die Studio-Zeile
 * läuft nach 10 Min. in „failed (Zeitüberschreitung)".
 *
 * Dieser Worker pollt den Bucket nach Job-Dateien (…/jobs/…) und ruft für jede den
 * ECHTEN Handler auf (amplify/functions/ingest/handler.ts) — kein Code-Duplikat.
 * ffmpeg kommt lokal aus ffmpeg-static (kein Lambda-Layer nötig).
 *
 * Starten (zweites Terminal, parallel zu `pnpm dev`):
 *   pnpm worker:local
 *
 * Voraussetzungen: .env.local mit DATABASE_URL, ANTHROPIC_API_KEY, GEMINI_API_KEY,
 * VOYAGE_API_KEY, AWS_REGION, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID/SECRET.
 */

import dotenv from "dotenv"

// MUSS vor dem Handler-Import laufen: handler.ts baut beim Modul-Load die
// Postgres-Verbindung aus process.env auf.
dotenv.config({ path: ".env.local" })

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"
import type { S3Event } from "aws-lambda"

const BUCKET = process.env.S3_BUCKET_NAME
const POLL_MS = 3000
const ONCE = process.argv.includes("--once")

const s3 = new S3Client({ region: process.env.AWS_REGION })

// Alle aktuell vorliegenden Job-Schlüssel (…/jobs/…) auflisten.
async function listJobKeys(): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "notebooks/", ContinuationToken: token }))
    for (const obj of res.Contents ?? []) {
      const key = obj.Key ?? ""
      // notebooks/{notebookId}/jobs/{type}/{id}.json
      if (key.split("/")[2] === "jobs" && key.endsWith(".json")) keys.push(key)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

// Einen Job über den echten Handler verarbeiten (synthetisches S3-Event).
async function processKey(handler: (e: S3Event) => Promise<void>, key: string) {
  const event = {
    Records: [{ s3: { bucket: { name: BUCKET }, object: { key } } }]
  } as unknown as S3Event
  const started = Date.now()
  console.log(`▶ verarbeite ${key} …`)
  try {
    await handler(event)
    console.log(`✓ fertig ${key}  (${Math.round((Date.now() - started) / 1000)}s)`)
  } catch (err) {
    console.error(`✗ Fehler bei ${key}:`, err instanceof Error ? err.message : err)
  }
}

async function main() {
  if (!BUCKET) throw new Error("S3_BUCKET_NAME fehlt in .env.local")
  for (const key of ["DATABASE_URL", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
    if (!process.env[key]) throw new Error(`Env-Variable fehlt: ${key}`)
  }

  // Handler erst nach dotenv laden (siehe oben).
  const { handler } = (await import("../amplify/functions/ingest/handler")) as unknown as {
    handler: (e: S3Event) => Promise<void>
  }

  console.log(`Lokaler ingest-Worker läuft. Bucket: ${BUCKET}${ONCE ? " (einmaliger Lauf)" : ` (Poll alle ${POLL_MS / 1000}s)`}`)

  // Bereits in Verarbeitung genommene Keys, um Doppelläufe innerhalb eines Polls
  // zu vermeiden (der Handler löscht die Job-Datei nach Erfolg ohnehin).
  const inflight = new Set<string>()

  do {
    let keys: string[] = []
    try {
      keys = await listJobKeys()
    } catch (err) {
      console.error("S3-Listing fehlgeschlagen:", err instanceof Error ? err.message : err)
    }
    for (const key of keys) {
      if (inflight.has(key)) continue
      inflight.add(key)
      await processKey(handler, key)
      inflight.delete(key)
    }
    if (!ONCE) await new Promise((r) => setTimeout(r, POLL_MS))
  } while (!ONCE)
}

main().catch((err) => {
  console.error("Worker abgebrochen:", err instanceof Error ? err.message : err)
  process.exit(1)
})
