import { env } from "cloudflare:workers"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { getDb } from "@/db"
import { account, session, user, verification } from "@/db/schema"

// Pro Request neu aufgebaut, weil der DB-Client an den Request gebunden ist (siehe getDb).
export function getAuth() {
  return betterAuth({
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
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      }
    }
  })
}
