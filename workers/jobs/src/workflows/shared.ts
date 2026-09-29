import type { WorkflowStepConfig } from "cloudflare:workers"

export const API_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "15 seconds", backoff: "exponential" },
  timeout: "10 minutes"
}

export const DB_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "2 seconds", backoff: "exponential" },
  timeout: "1 minute"
}
