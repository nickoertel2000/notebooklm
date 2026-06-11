import Anthropic from "@anthropic-ai/sdk"

// Lazy initialisiert, damit der bloße Import (z. B. beim Build) nicht fehlschlägt,
// falls ANTHROPIC_API_KEY noch nicht gesetzt ist. Liest den Key aus der Umgebung.
let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

// Günstigstes Modell als Standard: Claude Haiku 4.5 ($1/$5 pro 1M Tokens).
// Über CLAUDE_MODEL überschreibbar.
export const CHAT_MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5"

// Berichte synthetisieren über viele Quellen — dafür das stärkere Sonnet-Modell.
// Über CLAUDE_REPORT_MODEL überschreibbar.
export const REPORT_MODEL = process.env.CLAUDE_REPORT_MODEL ?? "claude-sonnet-4-6"
