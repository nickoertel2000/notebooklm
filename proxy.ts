import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Nur ein Komfort-Redirect, keine Sicherheitsgrenze: Jede Page und Route prüft die Session selbst.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: ["/((?!api/auth|api/demo|_next/static|_next/image|favicon|icons|.*\\.svg$|.*\\.png$|.*\\.ico$).*)"]
}
