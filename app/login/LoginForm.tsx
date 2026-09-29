"use client"

import { authClient } from "@/auth-client"
import { readError, readJson } from "@/lib/api/client"
import { DEMO_INACTIVE_DAYS } from "@/lib/demoConfig"
import { DemoAccount, saveDemoAccount, useDemoAccount } from "@/lib/useDemoAccount"
import Image from "next/image"
import "material-symbols"
import { useState } from "react"
import styles from "./login.module.scss"

type Mode = "signin" | "signup"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Tippt den Wert sichtbar ein, damit erkennbar ist, dass der normale Login genutzt wird.
async function typeInto(setValue: (value: string) => void, value: string) {
  for (let i = 1; i <= value.length; i++) {
    setValue(value.slice(0, i))
    await sleep(12)
  }
}

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [filledDemo, setFilledDemo] = useState<DemoAccount | null>(null)
  const storedDemo = useDemoAccount()

  async function handleDemo() {
    setError(null)
    setDemoLoading(true)
    try {
      let account = storedDemo
      if (!account) {
        const res = await fetch("/api/demo", { method: "POST" })
        if (!res.ok) {
          setError(await readError(res, "Das Demo-Konto konnte nicht angelegt werden."))
          return
        }
        account = await readJson<DemoAccount>(res)
        saveDemoAccount(account)
      }
      setMode("signin")
      await typeInto(setEmail, account.email)
      await typeInto(setPassword, account.password)
      setFilledDemo(account)
    } catch (err) {
      console.error("Demo-Zugang fehlgeschlagen:", err)
      setError("Etwas ist schiefgelaufen. Bitte erneut versuchen.")
    } finally {
      setDemoLoading(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = mode === "signup" ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password })

      if (authError) {
        // Das gespeicherte Demo-Konto wurde nach der Inaktivitätsfrist gelöscht.
        if (mode === "signin" && storedDemo && email === storedDemo.email) {
          saveDemoAccount(null)
          setFilledDemo(null)
          setError("Dein Demo-Konto ist abgelaufen. Starte einfach eine neue Demo.")
          return
        }
        setError(
          mode === "signup"
            ? "Registrierung fehlgeschlagen. E-Mail evtl. bereits vergeben oder Passwort zu kurz (mind. 8 Zeichen)."
            : "Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen."
        )
        return
      }

      // Ersetzt den Verlaufseintrag, sonst führt die Zurück-Taste wieder auf die Login-Seite.
      window.location.replace("/")
    } catch (err) {
      console.error("Anmeldung fehlgeschlagen:", err)
      setError("Etwas ist schiefgelaufen. Bitte erneut versuchen.")
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"))
    setError(null)
    setFilledDemo(null)
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Image src="/notebook-logo.svg" alt="NotebookLM" width={1253} height={132} priority className={styles.logo} />

        <p className={styles.tagline}>Dein persönlicher KI-Assistent für Notizen</p>

        <section className={styles.demo} aria-label="Demo-Zugang">
          <span className={styles.demoBadge}>Demo</span>
          <p className={styles.demoText}>
            {storedDemo
              ? `Dein Demo-Konto ist in diesem Browser gespeichert und bleibt ${DEMO_INACTIVE_DAYS} Tage nach dem letzten Login erhalten.`
              : "Ohne eigenes Konto ausprobieren: Ein Klick legt ein Demo-Konto mit Beispiel-Notebooks an und füllt die Zugangsdaten aus."}
          </p>
          <button type="button" className={styles.demoBtn} onClick={handleDemo} disabled={demoLoading || loading}>
            {demoLoading ? "Demo wird vorbereitet …" : storedDemo ? "Mit deinem Demo-Konto fortfahren" : "Demo-Zugang erstellen"}
          </button>
        </section>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === "signup" && (
            <input
              className={styles.input}
              type="text"
              placeholder="Nutzername"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <input className={styles.input} type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <div className={styles.passwordField}>
            <input
              className={`${styles.input} ${styles.passwordInput}`}
              type={showPassword ? "text" : "password"}
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
              aria-pressed={showPassword}
              title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              <span className="material-symbols-outlined">{showPassword ? "visibility_off" : "visibility"}</span>
            </button>
          </div>

          {filledDemo && email === filledDemo.email && (
            <p className={styles.demoCredentials}>
              Deine Demo-Zugangsdaten sind eingetragen und in diesem Browser gespeichert. Das Konto wird nach {DEMO_INACTIVE_DAYS} Tagen ohne Login gelöscht. Jetzt
              nur noch anmelden.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading || demoLoading}>
            {loading ? "Bitte warten …" : mode === "signup" ? "Konto erstellen" : "Anmelden"}
          </button>
        </form>

        <button type="button" className={styles.toggle} onClick={toggleMode}>
          {mode === "signup" ? "Schon registriert? Anmelden" : "Noch kein Konto? Registrieren"}
        </button>

        <div className={styles.divider}>
          <span>oder</span>
        </div>

        <button type="button" className={styles.googleBtn} disabled title="Die Anmeldung mit Google ist in dieser Demo deaktiviert">
          <span className={styles.disabledBadge}>In Demo deaktiviert</span>
          <svg className={styles.googleLogo} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Mit Google anmelden
        </button>

        <p className={styles.disclaimer}>
          Mit der Anmeldung stimmst du den{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">
            Nutzungsbedingungen
          </a>{" "}
          und der{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Datenschutzerklärung
          </a>{" "}
          zu.
        </p>
      </div>
    </main>
  )
}
