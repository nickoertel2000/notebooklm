import { Container } from "@cloudflare/containers"

export class VideoRenderer extends Container {
  defaultPort = 8080
  sleepAfter = "2m"
}
