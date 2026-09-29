import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth/session"
import LoginForm from "./LoginForm"

// vinext erkennt headers() nicht beim Build, die Seite hängt aber von der Session ab.
export const dynamic = "force-dynamic"

// Gültig angemeldet → direkt zur Übersicht. Bewusst hier statt in proxy.ts: Der Proxy
// sieht nur das Cookie, bei einer abgelaufenen Session entstünde eine Redirect-Schleife.
export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect("/")

  return <LoginForm />
}
