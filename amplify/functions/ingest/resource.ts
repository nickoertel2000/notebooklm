import { defineFunction, secret } from "@aws-amplify/backend"

// Hintergrund-Worker, per S3-Upload-Trigger. Verarbeitet je nach Key-Prefix:
//  - notebooks/{nb}/sources/...     → Quelle ingesten (Text → Chunks → Embeddings)
//  - notebooks/{nb}/jobs/report/... → Bericht via Claude erzeugen
//  - notebooks/{nb}/jobs/audio/...  → Audio via Claude-Skript + Gemini-TTS erzeugen
//  - notebooks/{nb}/jobs/video/...  → Video: Claude-Skript + Gemini-TTS + Gemini-Bild
//                                     („Nano Banana") + ffmpeg-Slideshow → MP4
// Lange AI-Generierung gehört hierher (Timeout bis 900s), nicht in die SSR-Route
// (Amplify-Hosting killt die nach 30s).
//
// ffmpeg für die Video-Übersicht: der Lambda-Runtime bringt KEIN ffmpeg mit, und
// das esbuild-Bundling von Amplify kopiert die ffmpeg-static-Binary nicht. Daher
// per Lambda-Layer bereitstellen und FFMPEG_PATH auf das Binary im Layer zeigen
// lassen (üblich: /opt/bin/ffmpeg). Den Layer-ARN über die Build-Env-Variable
// FFMPEG_LAYER_ARN setzen (z. B. ein öffentlicher ffmpeg-Layer oder ein eigener).
// Ist kein Layer gesetzt, funktionieren Quellen/Berichte/Audio weiterhin; nur die
// Video-Erstellung schlägt fehl. Siehe README → „Video-Übersicht (Deployment)".
const ffmpegLayerArn = process.env.FFMPEG_LAYER_ARN

export const ingest = defineFunction({
  name: "ingest",
  entry: "./handler.ts",
  timeoutSeconds: 600,
  memoryMB: 2048,
  ...(ffmpegLayerArn ? { layers: { ffmpeg: ffmpegLayerArn } } : {}),
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    VOYAGE_API_KEY: secret("VOYAGE_API_KEY"),
    ANTHROPIC_API_KEY: secret("ANTHROPIC_API_KEY"),
    GEMINI_API_KEY: secret("GEMINI_API_KEY"),
    // Pfad zur ffmpeg-Binary im Lambda-Layer (siehe oben).
    FFMPEG_PATH: process.env.FFMPEG_PATH ?? "/opt/bin/ffmpeg"
  }
})
