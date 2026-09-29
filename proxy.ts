import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Nur ein Komfort-Redirect ohne Session-Cookie – die echte Prüfung macht jede Page/Route selbst.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon|icons|.*\\.svg$|.*\\.png$|.*\\.ico$).*)"]
}
