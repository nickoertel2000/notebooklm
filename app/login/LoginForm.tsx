"use client"

import { authClient } from "@/auth-client"
import Turnstile, { type TurnstileHandle } from "@/components/Turnstile/Turnstile"
import { readError, readJson } from "@/lib/api/client"
import { DEMO_INACTIVE_DAYS } from "@/lib/demoConfig"
import { TURNSTILE_HEADER } from "@/lib/turnstileConfig"
import { DemoAccount, saveDemoAccount, useDemoAccount } from "@/lib/useDemoAccount"
import Image from "next/image"
import "material-symbols"
import { useRef, useState } from "react"
import styles from "./login.module.scss"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Tippt den Wert sichtbar ein, damit erkennbar ist, dass der normale Login genutzt wird.
async function typeInto(setValue: (value: string) => void, value: string) {
  for (let i = 1; i <= value.length; i++) {
    setValue(value.slice(0, i))
    await sleep(12)
  }
}

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [filledDemo, setFilledDemo] = useState<DemoAccount | null>(null)
  const storedDemo = useDemoAccount()
  const [demoToken, setDemoToken] = useState<string | null>(null)
  const demoTurnstile = useRef<TurnstileHandle>(null)

  async function handleDemo() {
    setError(null)
    setDemoLoading(true)
    try {
      let account = storedDemo
      if (!account) {
        const res = await fetch("/api/demo", { method: "POST", headers: { [TURNSTILE_HEADER]: demoToken ?? "" } })
        demoTurnstile.current?.reset()
        if (!res.ok) {
          setError(await readError(res, "Das Demo-Konto konnte nicht angelegt werden."))
          return
        }
        account = await readJson<DemoAccount>(res)
        saveDemoAccount(account)
      }
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
      const { error: authError } = await authClient.signIn.email({ email, password })

      if (authError) {
        if (authError.status === 429) {
          setError("Zu viele Versuche. Bitte warte eine Minute.")
          return
        }
        // Scheitert der Login mit dem gespeicherten Demo-Konto, wurde es nach Inaktivität gelöscht.
        if (storedDemo && email === storedDemo.email) {
          saveDemoAccount(null)
          setFilledDemo(null)
          setError("Dein Demo-Konto ist abgelaufen. Starte einfach eine neue Demo.")
          return
        }
        setError("Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.")
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

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Image src="/notebook-logo.svg" alt="NotebookLM Klon" width={1253} height={132} priority className={styles.logo} />

        <p className={styles.tagline}>Dein persönlicher KI-Assistent für Notizen</p>

        <section className={styles.demo} aria-label="Demo-Zugang">
          <span className={styles.demoBadge}>Demo</span>
          <p className={styles.demoText}>
            {storedDemo
              ? `Dein Demo-Konto ist in diesem Browser gespeichert und bleibt ${DEMO_INACTIVE_DAYS} Tage nach dem letzten Login erhalten.`
              : "Ohne eigenes Konto ausprobieren: Ein Klick legt ein Demo-Konto mit Beispiel-Notebooks an und füllt die Zugangsdaten aus."}
          </p>
          {!storedDemo && <Turnstile ref={demoTurnstile} action="demo" onToken={setDemoToken} onError={setError} />}
          <button type="button" className={styles.demoBtn} onClick={handleDemo} disabled={demoLoading || loading || (!storedDemo && !demoToken)}>
            {demoLoading ? "Demo wird vorbereitet …" : storedDemo ? "Mit deinem Demo-Konto fortfahren" : "Demo-Zugang erstellen"}
          </button>
        </section>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input className={styles.input} type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <div className={styles.passwordField}>
            <input
              className={`${styles.input} ${styles.passwordInput}`}
              type={showPassword ? "text" : "password"}
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
            {loading ? "Bitte warten …" : "Anmelden"}
          </button>
        </form>

        <p className={styles.disclaimer}>
          Demo-Projekt: ein Nachbau von Google NotebookLM, kein Google-Produkt.{" "}
          <a href="https://github.com/nickoertel2000/notebooklm" target="_blank" rel="noopener noreferrer">
            Quellcode auf GitHub
          </a>
        </p>
      </div>
    </main>
  )
}
