import { execSync } from "node:child_process"

// Muss zu compose.yaml passen.
export const testDatabaseUrl = "postgres://e2e:e2e@localhost:5433/e2e"

export function startTestDatabase() {
  try {
    execSync("docker compose up -d --wait --force-recreate", { stdio: "inherit" })
  } catch {
    throw new Error("Docker läuft nicht. Docker Desktop installieren und starten, dann erneut pnpm test:e2e ausführen.")
  }
}

export function stopTestDatabase() {
  execSync("docker compose down", { stdio: "inherit" })
}
