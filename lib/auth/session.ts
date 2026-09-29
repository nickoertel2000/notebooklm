import { headers } from "next/headers"
import { getAuth } from "@/auth"

// Liest die aktuelle better-auth-Session serverseitig aus.
export async function getSessionUser() {
  const session = await getAuth().api.getSession({ headers: await headers() })
  return session?.user ?? null
}
