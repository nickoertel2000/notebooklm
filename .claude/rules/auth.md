---
paths:
  - "auth.ts"
  - "auth-client.ts"
  - "lib/auth/**"
  - "middleware.ts"
  - "app/login/**"
  - "app/api/auth/**"
  - "components/Header/**"
---

# Authentication (Better Auth)

- Server config `auth.ts`: Drizzle adapter (`provider: "pg"`), email + password (no email verification) and Google OAuth. `BETTER_AUTH_SECRET` is read implicitly from env, `baseURL` is `NEXT_PUBLIC_APP_URL`. Sessions are DB sessions, not JWT.
- Handler: `app/api/auth/[...all]/route.ts` = `toNextJsHandler(auth)`.
- Server-side session: always `getSessionUser()` (`lib/auth/session.ts`). `components/Header/Header.tsx` still calls `auth.api.getSession` directly — don't copy that.
- Client: `authClient` from `auth-client.ts`, created **without** `baseURL` on purpose (uses the current origin; otherwise "Failed to fetch" on other ports/hosts). Sign-in/out and sign-up only through it.
- `middleware.ts` only checks the cookie via `getSessionCookie` (no DB call) and redirects to `/login`. Next 16 marks `middleware` as deprecated in favor of `proxy.ts` (Node runtime only); it's deliberately not renamed yet — see `cloudflare-migration.md`. It is not a security boundary — pages redirect with `redirect("/login")`, API routes return 401 themselves. When adding public paths (assets, new public pages), extend the `matcher`.
- Signup's "Nutzername" field is stored as Better Auth `name`; login is by email. There is no username plugin.
- Login page: hard navigation `window.location.href = "/"` after success so the Server Components see the new cookie.
- Google OAuth redirect URIs are configured in the Google Cloud Console per domain — a new deployment domain (e.g. Cloudflare) needs a new entry there, plus `NEXT_PUBLIC_APP_URL`.
