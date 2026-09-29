import Anthropic from "@anthropic-ai/sdk"
import { env } from "cloudflare:workers"

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

// Modell-IDs kommen aus den vars der Worker-Konfiguration (wrangler.jsonc).
export const chatModel = () => env.CLAUDE_MODEL
export const reportModel = () => env.CLAUDE_REPORT_MODEL
