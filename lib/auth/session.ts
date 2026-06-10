import { headers } from "next/headers"
import { auth } from "@/auth"

// Liest die aktuelle better-auth-Session serverseitig aus.
export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}
