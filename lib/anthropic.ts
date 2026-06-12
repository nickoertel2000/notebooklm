import Anthropic from "@anthropic-ai/sdk"

// Lazy initialisiert, damit der bloße Import (z. B. beim Build) nicht fehlschlägt,
// falls ANTHROPIC_API_KEY noch nicht gesetzt ist. Liest den Key aus der Umgebung.
let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

// Standardmodell für den Chat: Claude Sonnet 4.6 — bessere Antwortqualität.
// Über CLAUDE_MODEL überschreibbar.
export const CHAT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6"

// Berichte synthetisieren über viele Quellen — dafür das stärkere Sonnet-Modell.
// Über CLAUDE_REPORT_MODEL überschreibbar.
export const REPORT_MODEL = process.env.CLAUDE_REPORT_MODEL ?? "claude-sonnet-4-6"
