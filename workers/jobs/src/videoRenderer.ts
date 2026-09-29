import { Container } from "@cloudflare/containers"

// Durable Object vor dem ffmpeg-Container (containers/video-renderer). Eine Instanz
// pro Video, schläft nach kurzer Inaktivität ein und kostet dann nichts.
export class VideoRenderer extends Container {
  defaultPort = 8080
  sleepAfter = "2m"
}
