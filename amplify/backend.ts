import { defineBackend } from "@aws-amplify/backend"
// Explizite .ts-Endungen: Amplifys in-process tsImport-Loader (tsx) löst auf
// Windows + Node 22 extensionslose relative Imports nicht auf (CDK Assembly Error).
import { ingest } from "./functions/ingest/resource.ts"
import { storage } from "./storage/resource.ts"

// Bewusst KEIN Amplify Auth/Data — Auth läuft über better-auth, Daten über
// Drizzle/Supabase. Amplify verwaltet hier nur S3-Storage + Ingest-Lambda.
defineBackend({
  storage,
  ingest
})
