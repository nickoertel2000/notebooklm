import { env } from "cloudflare:workers"
import type { TurnstileAction } from "@/lib/turnstileConfig"

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export type SiteverifyResult = {
  success: boolean
  action?: string
  hostname?: string
  metadata?: { result_with_testing_key?: boolean }
}

// Cloudflares Test-Keys liefern weder action noch den echten Hostnamen. Ihr Ergebnis gilt nur,
// wenn die App selbst unter localhost läuft (E2E-Tests), in Produktion nie.
export function isValidSiteverify(result: SiteverifyResult, action: TurnstileAction, appHostname: string): boolean {
  if (!result.success) return false
  if (result.metadata?.result_with_testing_key) return appHostname === "localhost"
  return result.action === action && result.hostname === appHostname
}

export async function verifyTurnstile(token: string | null, action: TurnstileAction, ip: string | null): Promise<boolean> {
  if (!token || token.length > 2048 || !env.TURNSTILE_SECRET_KEY) return false
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return false
    return isValidSiteverify((await res.json()) as SiteverifyResult, action, new URL(process.env.NEXT_PUBLIC_APP_URL!).hostname)
  } catch (err) {
    console.error("Turnstile-Prüfung fehlgeschlagen:", err)
    return false
  }
}
