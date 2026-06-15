import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "@/db"
import { user, session, account, verification } from "@/db/schema"

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification }
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
    }
  }
})
