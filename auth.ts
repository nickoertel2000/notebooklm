import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { cacheForRequest } from "vinext/cache"
import { getDb } from "@/db"
import { account, session, user, verification } from "@/db/schema"
import { verifyTurnstile } from "@/lib/turnstile"
import { TURNSTILE_HEADER } from "@/lib/turnstileConfig"

// Einmal pro Request, weil der DB-Client an den Request gebunden ist (siehe getDb).
export const getAuth = cacheForRequest(() =>
  betterAuth({
    baseURL: process.env.NEXT_PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification }
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false
    },
    hooks: {
      // Ohne ctx.request ist es ein Serveraufruf (Demo-Route), der eigene Limits hat.
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.request || (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email")) return

        const ip = ctx.request.headers.get("cf-connecting-ip") ?? "local"
        const { success } = await env.AUTH_RATE_LIMITER.limit({ key: ip })
        if (!success) throw new APIError("TOO_MANY_REQUESTS", { message: "Zu viele Versuche. Bitte warte eine Minute." })

        // Sonst ließe sich die Obergrenze für Demo-Konten über die normale Registrierung ausschöpfen.
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : ""
        if (ctx.path === "/sign-up/email" && email.endsWith(`@${env.DEMO_EMAIL_DOMAIN}`)) {
          throw new APIError("BAD_REQUEST", { message: "Diese E-Mail-Domain ist für Demo-Konten reserviert." })
        }

        if (
          ctx.path === "/sign-up/email" &&
          !(await verifyTurnstile(ctx.request.headers.get(TURNSTILE_HEADER), "signup", ctx.request.headers.get("cf-connecting-ip")))
        ) {
          throw new APIError("FORBIDDEN", { message: "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut." })
        }
      })
    }
  })
)
