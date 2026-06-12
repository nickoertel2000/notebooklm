import { defineFunction, secret } from "@aws-amplify/backend"

// Hintergrund-Worker, per S3-Upload-Trigger. Verarbeitet je nach Key-Prefix:
//  - notebooks/{nb}/sources/...     → Quelle ingesten (Text → Chunks → Embeddings)
//  - notebooks/{nb}/jobs/report/... → Bericht via Claude erzeugen
//  - notebooks/{nb}/jobs/audio/...  → Audio via Claude-Skript + Gemini-TTS erzeugen
// Lange AI-Generierung gehört hierher (Timeout bis 900s), nicht in die SSR-Route
// (Amplify-Hosting killt die nach 30s).
export const ingest = defineFunction({
  name: "ingest",
  entry: "./handler.ts",
  timeoutSeconds: 600,
  memoryMB: 1536,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    VOYAGE_API_KEY: secret("VOYAGE_API_KEY"),
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    GEMINI_API_KEY: secret("GEMINI_API_KEY")
  }
})
