import { randomBytes } from "node:crypto"
import { defineConfig, devices } from "@playwright/test"

// Standard ist die Testdatenbank aus compose.yaml, dieselbe Adresse nutzt der Service-Container der CI.
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgres://e2e:e2e@localhost:5433/e2e"
process.env.E2E_DATABASE_URL = databaseUrl

if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("E2E-Tests laufen nur gegen eine lokale Testdatenbank (docker compose up -d), nie gegen Neon.")
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
    // Ein bereits laufendes pnpm dev hängt an der Produktionsdatenbank.
    reuseExistingServer: false,
    // Wrangler lädt auch hier die .env.local mit den Produktionswerten, Umgebungsvariablen haben aber
    // Vorrang. Deshalb wird jedes Secret aus secrets.required und die Hyperdrive-Verbindung überschrieben.
    env: {
      E2E: "1",
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      GEMINI_API_KEY: "e2e-ohne-ki",
      TAVILY_API_KEY: "e2e-ohne-ki"
    }
  }
})
