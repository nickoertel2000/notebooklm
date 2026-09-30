// PreToolUse: blockiert jeden Zugriff auf die Dateien mit Secrets, auch über Umwege wie grep, cp oder
// Get-Content, die die Deny-Liste in settings.json nicht einzeln erfassen kann. Exit 2 meldet den Grund an Claude.
import { readFileSync } from "node:fs"

// Auch Teilnamen und Globs (cat .env.loc*, .env.*, .dev.var?), die die Shell erst später auflöst.
const SECRET_FILE = /\.env\.l|\.dev\.v|\.(env|dev)\.?[*?[{]/
// Lädt die Datei in einen Prozess, ohne ihren Inhalt auszugeben.
const ENV_FILE_FLAG = /--env-file[= ]\.env\.local\b/g
// Nur gequotete Heredocs (<<'EOF') sind reine Daten, in ungequoteten würde $(…) ausgeführt.
const HEREDOC = /<<-?\s*(['"])(\w+)\1[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g
// Bei Datei-Tools zählt nur das Ziel, nicht der Text, der geschrieben oder gesucht wird.
const PATH_FIELDS = ["file_path", "path", "glob", "notebook_path"]

const { tool_name: tool, tool_input: input = {} } = JSON.parse(readFileSync(0, "utf8"))

const targets =
  tool === "Bash" || tool === "PowerShell"
    ? [
        String(input.command ?? "")
          .replace(HEREDOC, "")
          .replace(ENV_FILE_FLAG, "")
      ]
    : PATH_FIELDS.map((field) => input[field]).filter((v) => typeof v === "string")

if (targets.some((v) => SECRET_FILE.test(v))) {
  console.error(
    "Blockiert: .env.local und .dev.vars enthalten Secrets und dürfen weder gelesen noch durchsucht, kopiert oder geschrieben werden. Prozesse dürfen sie laden (pnpm dev, pnpm db:*, node --env-file=.env.local)."
  )
  process.exit(2)
}
