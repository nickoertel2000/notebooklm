---
paths:
  - "auth.ts"
  - "auth-client.ts"
  - "lib/auth/**"
  - "proxy.ts"
  - "app/login/**"
  - "app/api/auth/**"
  - "components/Header/**"
  - "app/api/demo/**"
  - "lib/demo.ts"
  - "lib/demoConfig.ts"
  - "lib/useDemoAccount.ts"
  - "workers/jobs/src/index.ts"
---

# Authentication (Better Auth)

- Server config `auth.ts`: `getAuth()` builds the Better Auth instance per request (the DB client from `getDb()` is request-bound). Drizzle adapter (`provider: "pg"`), email + password only (no email verification). `secret` comes from `env` (`cloudflare:workers`), `baseURL` is `NEXT_PUBLIC_APP_URL`. Sessions are DB sessions, not JWT.
- Handler: `app/api/auth/[...all]/route.ts` passes GET/POST to `getAuth().handler(request)`.
- Server-side session: always `getSessionUser()` (`lib/auth/session.ts`); API routes use `authorizeNotebook()`.
- Client: `authClient` from `auth-client.ts`, created **without** `baseURL` on purpose (uses the current origin; otherwise "Failed to fetch" on other ports/hosts). Sign-in/out and sign-up only through it.
- `proxy.ts` (Next 16 name for middleware, supported by vinext) only checks the cookie via `getSessionCookie` (no DB call) and redirects to `/login`. It is not a security boundary — pages redirect with `redirect("/login")`, API routes return 401 themselves. When adding public paths (assets, new public pages), extend the `matcher`.
- Signup's "Nutzername" field is stored as Better Auth `name`; login is by email. There is no username plugin.
- Login page: `page.tsx` is a Server Component that redirects a valid session to `/` (never in `proxy.ts`: it only sees the cookie, a stale session would loop between `/` and `/login`); the form is `LoginForm.tsx`. After success it navigates hard with `window.location.replace("/")` so the Server Components see the new cookie and `/login` does not stay in the history.
- The Google button on the login page is a teaser without function (recruiters shouldn't have to connect a personal account). There is no OAuth client; re-enabling Google means `socialProviders` in `auth.ts`, two secrets and redirect URIs per domain (`…/api/auth/callback/google`).

## Demo accounts

- `POST /api/demo` (public, excluded in the `proxy.ts` matcher) creates `demo-<random>@DEMO_EMAIL_DOMAIN` with a random password via `getAuth().api.signUpEmail`, then `cloneTemplateNotebooks` (`lib/demo.ts`) copies all notebooks of the template account (`DEMO_TEMPLATE_EMAIL`, a normal account curated in the app). The client types the credentials into the normal form, then the visitor signs in via the normal login; `lib/useDemoAccount.ts` remembers them in `localStorage`.
- Demo accounts are recognized only by the email domain, there is no DB flag. The template email must not use that domain, otherwise the cleanup deletes it.
- The clone is the only deliberate exception to the ownership chain: it reads the template's rows by the template's `userId`. Only `ready` rows are copied, IDs are new, citation IDs in `messages` are remapped, `createdAt` is kept (the slide image budget counts videos created today). Chunks are copied with `INSERT … SELECT` so embeddings never pass through the Worker.
- Copied rows keep the template's R2 keys. Single-file deletes must use `deleteNotebookObject(notebookId, key)` (only deletes keys under the own notebook prefix), never a plain bucket delete. Deleting the template's notebooks breaks existing copies.
- Protection: Rate Limiting binding `DEMO_RATE_LIMITER` per IP and `DEMO_MAX_ACCOUNTS`.
- The template is curated only in production (local `pnpm dev` uses the same DB but an emulated R2, files would be missing). Changing its email or password: `node --env-file=.env.local scripts/demo-template-login.mjs --from <email> [--to <new email>]` (dry run, `--apply` executes; password from 1Password `DEMO_TEMPLATE_PASSWORD`). It writes to the DB, so only with the user's approval; a new email also goes into `DEMO_TEMPLATE_EMAIL`.
- Cleanup: cron in the jobs Worker (`scheduled` → `deleteInactiveDemoAccounts`) deletes demo accounts whose latest session activity (or creation) is older than `DEMO_INACTIVE_DAYS` (`lib/demoConfig.ts`), R2 prefixes first, the rest by cascade.
