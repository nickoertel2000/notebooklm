import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

const databaseUrl = process.env.E2E_DATABASE_URL

// Der Dev-Server lädt .env.local mit, und die zeigt auf die Produktionsdatenbank.
if (!databaseUrl || existsSync(".env.local")) {
  throw new Error("E2E-Tests brauchen E2E_DATABASE_URL (eigene Testdatenbank) und laufen nie neben einer .env.local.")
}

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Seriell, weil der Demo-Zugang pro IP nur zwei Konten pro Minute anlegt.
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Der Dev-Server kompiliert jede Route beim ersten Aufruf und lädt die Seite neu, wenn Vite dabei
  // neue Abhängigkeiten optimiert. Die Wiederholung läuft dann gegen den aufgewärmten Server.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    timeout: 180_000,
    env: {
      E2E: "1",
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      GEMINI_API_KEY: "e2e-ohne-ki",
      TAVILY_API_KEY: "e2e-ohne-ki"
    }
  }
})
