---
paths:
  - "auth.ts"
  - "lib/turnstile*.ts"
  - "components/Turnstile/**"
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

# Authentifizierung (Better Auth)

- Server-Konfiguration `auth.ts`: `getAuth()` baut die Better-Auth-Instanz einmal pro Request über `cacheForRequest` (der DB-Client aus `getDb()` ist request-gebunden). Drizzle-Adapter (`provider: "pg"`), nur E-Mail + Passwort (keine E-Mail-Verifizierung). `secret` kommt aus `env` (`cloudflare:workers`), `baseURL` ist `NEXT_PUBLIC_APP_URL`. Sessions sind DB-Sessions, kein JWT.
- Handler: `app/api/auth/[...all]/route.ts` reicht GET/POST an `getAuth().handler(request)` weiter.
- Server-seitige Session: immer `getSessionUser()` (`lib/auth/session.ts`); API-Routen nutzen `authorizeNotebook()`.
- Client: `authClient` aus `auth-client.ts`, bewusst **ohne** `baseURL` erstellt (nutzt den aktuellen Origin; sonst „Failed to fetch“ auf anderen Ports/Hosts). Anmelden/Abmelden und Registrieren nur darüber.
- `proxy.ts` (Next-16-Name für Middleware, von vinext unterstützt) prüft nur das Cookie über `getSessionCookie` (kein DB-Aufruf) und leitet auf `/login` um. Es ist keine Sicherheitsgrenze – Seiten leiten per `redirect("/login")` um, API-Routen liefern selbst 401. Beim Hinzufügen öffentlicher Pfade (Assets, neue öffentliche Seiten) den `matcher` erweitern.
- Das Feld „Nutzername“ bei der Registrierung wird als Better-Auth-`name` gespeichert; der Login erfolgt per E-Mail. Es gibt kein Username-Plugin.
- Login-Seite: `page.tsx` ist eine Server Component, die eine gültige Session auf `/` umleitet (nie in `proxy.ts`: dort ist nur das Cookie sichtbar, eine veraltete Session würde zwischen `/` und `/login` pendeln); das Formular ist `LoginForm.tsx`. Nach Erfolg wird hart mit `window.location.replace("/")` navigiert, damit die Server Components das neue Cookie sehen und `/login` nicht in der History bleibt.
- Der Google-Button auf der Login-Seite ist ein Teaser ohne Funktion (Recruiter sollen kein privates Konto verbinden müssen). Es gibt keinen OAuth-Client; Google wieder zu aktivieren bedeutet `socialProviders` in `auth.ts`, zwei Secrets und Redirect-URIs pro Domain (`…/api/auth/callback/google`).

## Bot-Schutz (Turnstile)

- Registrierung (`hooks.before` in `auth.ts`) und `POST /api/demo` verlangen ein Turnstile-Token im Header `TURNSTILE_HEADER` (`lib/turnstileConfig.ts`), geprüft mit `verifyTurnstile` (`lib/turnstile.ts`): `success`, passende Action (`signup`, `demo`) und der Hostname aus `NEXT_PUBLIC_APP_URL`. Ohne Token wird vor dem Aufruf von Cloudflare abgelehnt (403), in `/api/demo` sogar vor dem Rate-Limit, damit fehlende Tokens keine Demo-Plätze verbrauchen.
- Client: `components/Turnstile/Turnstile.tsx`, explizit gerendert und `interaction-only`, also meist unsichtbar. Tokens gelten nur einmal: Nach jedem Request `reset()` aufrufen. Der jeweilige Button bleibt deaktiviert, bis ein Token da ist; lädt das Widget nicht (Werbeblocker, Netz), meldet `onError` das im Formular.
- Site-Key öffentlich in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Secret `TURNSTILE_SECRET_KEY`. Das Widget kennt die Domains Produktion, `localhost` und `127.0.0.1`; eine neue Domain muss im Cloudflare-Dashboard ergänzt werden.
- Die E2E-Tests nutzen Cloudflares Test-Keys (`playwright.config.ts`). Deren Ergebnis enthält weder Action noch echten Hostnamen und wird nur akzeptiert, wenn die App unter `localhost` läuft (`isValidSiteverify`).

## Demo-Accounts

- `POST /api/demo` (öffentlich, im `proxy.ts`-Matcher ausgenommen) erstellt `demo-<random>@DEMO_EMAIL_DOMAIN` mit zufälligem Passwort über `getAuth().api.signUpEmail`, danach kopiert `cloneTemplateNotebooks` (`lib/demo.ts`) alle Notebooks des Template-Accounts (`DEMO_TEMPLATE_EMAIL`, ein normaler, in der App kuratierter Account). Der Client trägt die Zugangsdaten ins normale Formular ein, danach meldet sich der Besucher über den normalen Login an; `lib/useDemoAccount.ts` merkt sie sich in `localStorage`.
- Demo-Accounts werden nur an der E-Mail-Domain erkannt, es gibt kein DB-Flag. Die Template-E-Mail darf diese Domain nicht verwenden, sonst löscht der Cleanup sie.
- Der Klon ist die einzige bewusste Ausnahme von der Ownership-Kette: Er liest die Zeilen des Templates über dessen `userId`. Nur `ready`-Zeilen werden kopiert, IDs sind neu, Citation-IDs in `messages` werden neu zugeordnet, `createdAt` bleibt erhalten (das Slide-Bild-Budget zählt heute erstellte Videos). Chunks werden mit `INSERT … SELECT` kopiert, damit Embeddings nie durch den Worker laufen.
- Kopierte Zeilen behalten die R2-Keys des Templates. Einzeldatei-Löschungen müssen `deleteNotebookObject(notebookId, key)` verwenden (löscht nur Keys unter dem eigenen Notebook-Präfix), nie ein einfaches Bucket-Delete. Das Löschen der Template-Notebooks macht bestehende Kopien kaputt.
- Schutz: Rate-Limiting-Binding `DEMO_RATE_LIMITER` pro IP und `DEMO_MAX_ACCOUNTS`. Die normale Registrierung lehnt die Demo-Domain ab (`hooks.before` in `auth.ts`), sonst könnte jeder `DEMO_MAX_ACCOUNTS` füllen; `/api/demo` ruft `signUpEmail` server-seitig ohne Request auf und ist nicht betroffen.
- Das Template wird nur in Production kuratiert (lokales `pnpm dev` nutzt dieselbe DB, aber einen emulierten R2, Dateien würden fehlen). E-Mail oder Passwort ändern: `node --env-file=.env.local scripts/demo-template-login.mjs --from <email> [--to <new email>]` (Dry-Run, `--apply` führt aus; Passwort aus 1Password `DEMO_TEMPLATE_PASSWORD`). Das Skript schreibt in die DB, daher nur mit Zustimmung des Nutzers; eine neue E-Mail kommt auch in `DEMO_TEMPLATE_EMAIL`.
- Cleanup: Cron im Jobs-Worker (`scheduled` → `deleteInactiveDemoAccounts`) löscht Demo-Accounts, deren letzte Session-Aktivität (oder Erstellung) älter als `DEMO_INACTIVE_DAYS` (`lib/demoConfig.ts`) ist, zuerst die R2-Präfixe, den Rest per Cascade.
