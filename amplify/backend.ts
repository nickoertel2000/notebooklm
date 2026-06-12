import { defineBackend } from "@aws-amplify/backend"
// Explizite .ts-Endungen: Amplifys in-process tsImport-Loader (tsx) löst auf
// Windows + Node 22 extensionslose relative Imports nicht auf (CDK Assembly Error).
import { ingest } from "./functions/ingest/resource.ts"
import { storage } from "./storage/resource.ts"

// Bewusst KEIN Amplify Auth/Data — Auth läuft über better-auth, Daten über
// Drizzle/Supabase. Amplify verwaltet hier nur S3-Storage + Ingest-Lambda.
const backend = defineBackend({
  storage,
  ingest
})

// Der Worker schreibt erzeugte Audios via lib/s3 (process.env.S3_BUCKET_NAME).
// Den tatsächlichen Bucket-Namen des Stacks zur Laufzeit injizieren.
backend.ingest.addEnvironment("S3_BUCKET_NAME", backend.storage.resources.bucket.bucketName)
