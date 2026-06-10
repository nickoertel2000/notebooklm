import { defineFunction, secret } from "@aws-amplify/backend"

// Lambda, die per S3-Upload-Trigger Quellen verarbeitet:
// Text extrahieren → chunken → Voyage-Embeddings → in Supabase speichern.
export const ingest = defineFunction({
  name: "ingest",
  entry: "./handler.ts",
  timeoutSeconds: 300,
  memoryMB: 1024,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    VOYAGE_API_KEY: secret("VOYAGE_API_KEY")
  }
})
