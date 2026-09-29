---
paths:
  - "auth.ts"
  - "auth-client.ts"
  - "lib/auth/**"
  - "proxy.ts"
  - "app/login/**"
  - "app/api/auth/**"
  - "components/Header/**"
---

# Authentication (Better Auth)

- Server config `auth.ts`: `getAuth()` builds the Better Auth instance per request (the DB client from `getDb()` is request-bound). Drizzle adapter (`provider: "pg"`), email + password (no email verification) and Google OAuth. `secret`/Google credentials come from `env` (`cloudflare:workers`), `baseURL` is `NEXT_PUBLIC_APP_URL`. Sessions are DB sessions, not JWT.
- Handler: `app/api/auth/[...all]/route.ts` passes GET/POST to `getAuth().handler(request)`.
- Server-side session: always `getSessionUser()` (`lib/auth/session.ts`); API routes use `authorizeNotebook()`.
- Client: `authClient` from `auth-client.ts`, created **without** `baseURL` on purpose (uses the current origin; otherwise "Failed to fetch" on other ports/hosts). Sign-in/out and sign-up only through it.
- `proxy.ts` (Next 16 name for middleware, supported by vinext) only checks the cookie via `getSessionCookie` (no DB call) and redirects to `/login`. It is not a security boundary — pages redirect with `redirect("/login")`, API routes return 401 themselves. When adding public paths (assets, new public pages), extend the `matcher`.
- Signup's "Nutzername" field is stored as Better Auth `name`; login is by email. There is no username plugin.
- Login page: hard navigation `window.location.href = "/"` after success so the Server Components see the new cookie.
- Google OAuth redirect URIs are configured in the Google Cloud Console per domain (`…/api/auth/callback/google`, currently localhost:3000 and the workers.dev URL) — a new domain needs a new entry there, plus `NEXT_PUBLIC_APP_URL`.
