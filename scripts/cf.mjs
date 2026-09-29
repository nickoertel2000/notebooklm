// Cloudflare-Hilfsbefehle, die Secrets aus 1Password brauchen. Die Werte landen nie
// im Terminal: op read → stdin bzw. eine temporäre Datei, die sofort gelöscht wird.
//
//   pnpm cf:secrets        Secrets beider Worker aktualisieren (Worker müssen existieren)
//   pnpm cf:first-deploy   Erster Deploy beider Worker inkl. Secrets, ohne Container-Image
//                          (braucht kein Docker; das Image baut danach Workers Builds)
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const VAULT = "op://Development/NotebookLM"
const shell = process.platform === "win32"

// Reihenfolge ist wichtig: Die App bindet die Workflows des Jobs-Workers per script_name.
const WORKERS = [
  {
    config: "workers/jobs/wrangler.jsonc",
    built: "dist/notebooklm_jobs/wrangler.json",
    secrets: ["GEMINI_API_KEY"],
    // Worker-Code und Workflows deployen, Container-Image überspringen.
    deployArgs: ["--containers-rollout=none"]
  },
  {
    config: "wrangler.jsonc",
    built: "dist/server/wrangler.json",
    secrets: ["BETTER_AUTH_SECRET", "GEMINI_API_KEY", "TAVILY_API_KEY"],
    deployArgs: []
  }
]

const readSecrets = (names) => Object.fromEntries(names.map((name) => [name, execFileSync("op", ["read", `${VAULT}/${name}`], { encoding: "utf8", shell }).trim()]))

const wrangler = (args, options = {}) => execFileSync("pnpm", ["exec", "wrangler", ...args], { stdio: "inherit", shell, ...options })

function updateSecrets() {
  for (const worker of WORKERS) {
    console.log(`${worker.config}: ${worker.secrets.join(", ")}`)
    wrangler(["secret", "bulk", "--config", worker.config], { input: JSON.stringify(readSecrets(worker.secrets)), stdio: ["pipe", "inherit", "inherit"] })
  }
}

function firstDeploy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cf-secrets-"))
  try {
    for (const worker of WORKERS) {
      const file = path.join(dir, "secrets.json")
      writeFileSync(file, JSON.stringify(readSecrets(worker.secrets)), { mode: 0o600 })
      try {
        wrangler(["deploy", "--config", worker.built, "--secrets-file", file, ...worker.deployArgs])
      } finally {
        rmSync(file, { force: true })
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const commands = { "secrets": updateSecrets, "first-deploy": firstDeploy }
const command = commands[process.argv[2]]
if (!command) {
  console.error(`Aufruf: node scripts/cf.mjs <${Object.keys(commands).join("|")}>`)
  process.exit(1)
}
command()
