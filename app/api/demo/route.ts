import { env } from "cloudflare:workers"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getAuth } from "@/auth"
import { getDb } from "@/db"
import { user } from "@/db/schema"
import { cloneTemplateNotebooks, countDemoAccounts, demoEmail } from "@/lib/demo"

// Öffentlich (ohne Session, siehe proxy.ts): legt ein Demo-Konto mit zufälligen
// Zugangsdaten an und kopiert die Vorlage hinein. Anmelden tut sich der Client selbst.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? "local"
  const { success } = await env.DEMO_RATE_LIMITER.limit({ key: ip })
  if (!success) return NextResponse.json({ error: "Zu viele Demo-Konten in kurzer Zeit. Bitte warte eine Minute." }, { status: 429 })

  if ((await countDemoAccounts()) >= Number(env.DEMO_MAX_ACCOUNTS)) {
    return NextResponse.json({ error: "Die Demo ist gerade ausgelastet. Bitte versuche es später erneut." }, { status: 503 })
  }

  const suffix = crypto.randomUUID().slice(0, 8)
  const email = demoEmail(suffix)
  const password = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  let userId: string | null = null
  try {
    const result = await getAuth().api.signUpEmail({ body: { name: `Demo ${suffix}`, email, password } })
    userId = result.user.id
    await cloneTemplateNotebooks(userId)
  } catch (err) {
    console.error("Demo-Konto konnte nicht angelegt werden:", err)
    // Kein halb befülltes Konto zurücklassen.
    if (userId) await getDb().delete(user).where(eq(user.id, userId))
    return NextResponse.json({ error: "Das Demo-Konto konnte nicht angelegt werden. Bitte versuche es erneut." }, { status: 500 })
  }

  return NextResponse.json({ email, password }, { status: 201 })
}
