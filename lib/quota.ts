import { env } from "cloudflare:workers"
import { and, count, eq, gte, lt, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { usageEvents } from "@/db/schema"

export type UsageKind = "chat" | "discover" | "studio" | "source" | "assist"

// Die Gratis-Kontingente von Gemini und Tavily teilen sich alle Besucher. Ohne Tageslimit
// pro Konto könnte ein einzelnes Skript die Demo für alle lahmlegen.
export const DAILY_LIMITS: Record<UsageKind, number> = { chat: 50, discover: 5, studio: 8, source: 30, assist: 30 }

// Knapp unter den Tageskontingenten der Anbieter (Flash-Lite, Tavily pro Monat, TTS-Kette), damit
// die Demo mit einer klaren Meldung stoppt statt mit einem 429 mitten in einem Workflow.
export const GLOBAL_DAILY_LIMITS: Record<UsageKind, number> = { chat: 400, discover: 30, studio: 30, source: 300, assist: 200 }

const LIMIT_LABELS: Record<UsageKind, string> = {
  chat: "Chat-Fragen",
  discover: "Websuchen",
  studio: "Studio-Inhalte",
  source: "neue Quellen",
  assist: "KI-Vorschläge"
}

// Gegen Skripte, die die Gratis-Datenbank mit leeren Notebooks füllen.
export const MAX_NOTEBOOKS_PER_USER = 30

export async function checkRateLimit(userId: string): Promise<string | null> {
  const { success } = await env.USER_RATE_LIMITER.limit({ key: userId })
  return success ? null : "Zu viele Anfragen in kurzer Zeit. Bitte warte einen Moment."
}

// Liefert eine Fehlermeldung, wenn ein Limit erreicht ist, sonst wird die Nutzung gebucht.
export async function consumeQuota(userId: string, kind: UsageKind): Promise<string | null> {
  const rateError = await checkRateLimit(userId)
  if (rateError) return rateError

  return getDb().transaction(async (tx) => {
    // Zählen und Buchen sind zwei Statements: Ohne Sperre kämen gleichzeitige Anfragen beide unter dem Limit durch.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`quota:${kind}`}))`)

    const [usage] = await tx
      .select({ own: sql<number>`count(*) filter (where ${usageEvents.userId} = ${userId})`.mapWith(Number), total: count() })
      .from(usageEvents)
      .where(and(eq(usageEvents.kind, kind), gte(usageEvents.createdAt, sql`now() - interval '1 day'`)))

    if (usage.total >= GLOBAL_DAILY_LIMITS[kind]) {
      return `Das Tageskontingent der Demo für ${LIMIT_LABELS[kind]} ist aufgebraucht. Bitte versuche es morgen erneut.`
    }
    if (usage.own >= DAILY_LIMITS[kind]) {
      return `Tageslimit erreicht: höchstens ${DAILY_LIMITS[kind]} ${LIMIT_LABELS[kind]} pro Tag in dieser Demo.`
    }

    await tx.insert(usageEvents).values({ userId, kind })
    return null
  })
}

export async function deleteOldUsageEvents(): Promise<void> {
  await getDb()
    .delete(usageEvents)
    .where(lt(usageEvents.createdAt, sql`now() - interval '2 days'`))
}
