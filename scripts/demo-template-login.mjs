// Setzt E-Mail und Passwort des Demo-Vorlage-Kontos direkt in der Datenbank (ohne
// Login nicht über Better Auth möglich). Das Passwort kommt aus 1Password und wird
// nie ausgegeben.
//
//   node --env-file=.env.local scripts/demo-template-login.mjs --from <alte E-Mail> --to <neue E-Mail>
//   … zusätzlich --apply schreibt die Änderung, ohne nur eine Vorschau.
//
// Danach DEMO_TEMPLATE_EMAIL in wrangler.jsonc auf die neue E-Mail setzen.
import { execFileSync } from "node:child_process"
import { parseArgs } from "node:util"
import { hashPassword } from "better-auth/crypto"
import postgres from "postgres"

const PASSWORD_REF = "op://Development/NotebookLM/DEMO_TEMPLATE_PASSWORD"
const DEMO_DOMAIN = "@demo.notebooklm.invalid"

const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, apply: { type: "boolean", default: false } } })
const from = values.from?.trim().toLowerCase()
const to = (values.to ?? values.from)?.trim().toLowerCase()
if (!from || !to) {
  console.error("Aufruf: --from <alte E-Mail> [--to <neue E-Mail>] [--apply]")
  process.exit(1)
}
// Die Aufräumroutine löscht alle Konten dieser Domain.
if (to.endsWith(DEMO_DOMAIN)) {
  console.error(`Die Vorlage darf nicht auf ${DEMO_DOMAIN} enden, sonst wird sie nach 7 Tagen gelöscht.`)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt (mit --env-file=.env.local aufrufen)")
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 })
try {
  const [account] = await sql`select id, email from "user" where email = ${from}`
  if (!account) throw new Error(`Kein Konto mit ${from} gefunden`)
  if (from !== to) {
    const [taken] = await sql`select id from "user" where email = ${to}`
    if (taken) throw new Error(`${to} ist bereits vergeben`)
  }
  const [{ n }] = await sql`select count(*)::int as n from notebooks where user_id = ${account.id}`
  console.log(`Konto gefunden: ${account.email} (${n} Notebooks)`)
  console.log(`Geplant: E-Mail → ${to}, Passwort → Wert aus ${PASSWORD_REF}`)

  if (!values.apply) {
    console.log("Vorschau, nichts geändert. Mit --apply ausführen.")
  } else {
    const password = execFileSync("op", ["read", PASSWORD_REF], { encoding: "utf8", shell: process.platform === "win32" }).trim()
    if (password.length < 8) throw new Error("Das Passwort in 1Password ist kürzer als 8 Zeichen")
    const hash = await hashPassword(password)

    await sql.begin(async (tx) => {
      await tx`update "user" set email = ${to}, updated_at = now() where id = ${account.id}`
      const updated = await tx`update account set password = ${hash}, updated_at = now() where user_id = ${account.id} and provider_id = 'credential'`
      if (updated.count !== 1) throw new Error(`Erwartet 1 Passwort-Eintrag, gefunden ${updated.count}`)
    })
    console.log(`Fertig: ${to} meldet sich mit dem Passwort aus 1Password an.`)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await sql.end()
}
