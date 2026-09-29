import type { WorkflowStepConfig } from "cloudflare:workers"

// Externe APIs (Gemini, Workers AI) sind die typischen Fehlerquellen: Rate-Limits
// und kurze Ausfälle. Deshalb pro Step wenige Wiederholungen mit Backoff.
export const API_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "15 seconds", backoff: "exponential" },
  timeout: "10 minutes"
}

// Reine DB-/Storage-Schritte: schnell, bei Fehlern kurz erneut versuchen.
export const DB_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
  timeout: "1 minute"
}
