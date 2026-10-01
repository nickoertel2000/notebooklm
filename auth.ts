import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { cacheForRequest } from "vinext/cache"
import { getDb } from "@/db"
import { account, session, user, verification } from "@/db/schema"

// Einmal pro Request, weil der DB-Client an den Request gebunden ist (siehe getDb).
export const getAuth = cacheForRequest(() =>
  betterAuth({
    baseURL: process.env.NEXT_PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification }
    }),
    // Nicht disableSignUp: Das sperrt auch den Serveraufruf, mit dem /api/demo die Demo-Konten anlegt.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false
    },
    hooks: {
      // Ohne ctx.request ist es ein Serveraufruf (Demo-Route), der eigene Limits hat.
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.request) return
        if (ctx.path === "/sign-up/email") {
          throw new APIError("FORBIDDEN", { message: "Eine Registrierung gibt es in dieser Demo nicht. Nutze den Demo-Zugang." })
        }
        if (ctx.path !== "/sign-in/email") return

        const ip = ctx.request.headers.get("cf-connecting-ip") ?? "local"
        const { success } = await env.AUTH_RATE_LIMITER.limit({ key: ip })
        if (!success) throw new APIError("TOO_MANY_REQUESTS", { message: "Zu viele Versuche. Bitte warte eine Minute." })
      })
    }
  })
)
