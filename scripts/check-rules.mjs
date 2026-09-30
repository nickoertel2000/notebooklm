// Prüft, ob alle Dateipfade, auf die CLAUDE.md, Rules, Agents und Commands verweisen, noch existieren.
// Veraltete Verweise führen den Agenten sonst still in die Irre.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOTS = ["app/", "components/", "containers/", "db/", "e2e/", "lib/", "public/", "scripts/", "styles/", "test/", "workers/", ".claude/", ".github/"]
// In den Rules als bewusst nicht verwendete Alternative erwähnt.
const MENTIONED_ONLY = new Set(["cloudflare.config.ts"])
const docs = [".claude/CLAUDE.md", "AGENTS.md", ...["rules", "agents", "commands"].flatMap((dir) => readdirSync(`.claude/${dir}`).map((f) => `.claude/${dir}/${f}`))]

const missing = []
for (const doc of docs) {
  const text = readFileSync(doc, "utf8")
  for (const [, ref] of text.matchAll(/`([^`\s]+)`/g)) {
    // Platzhalter, Globs und Beispiel-Keys wie notebooks/{id}/ sind keine echten Pfade.
    if (/[{}*<>]/.test(ref) || MENTIONED_ONLY.has(ref)) continue
    const file = ref.replace(/[.,:;]$/, "")
    let target = null
    if (ROOTS.some((root) => file.startsWith(root))) target = file
    else if (/^[\w-]+\.md$/.test(file)) target = existsSync(`.claude/rules/${file}`) ? `.claude/rules/${file}` : file
    else if (/^[\w.-]+\.(ts|mjs|json|jsonc|yaml|md)$/.test(file) && !file.startsWith(".env")) target = file
    if (target && !existsSync(target) && !existsSync(path.join(path.dirname(doc), target))) missing.push(`${doc}: ${ref}`)
  }
}

if (missing.length > 0) {
  console.error(`Verweise auf nicht vorhandene Dateien:\n${missing.map((m) => `  ${m}`).join("\n")}`)
  process.exit(1)
}
console.log(`Alle Dateiverweise in ${docs.length} Regeldateien sind gültig.`)
