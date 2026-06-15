"use client"

import { authClient } from "@/auth-client"
import Image from "next/image"
import { useState } from "react"
import styles from "./login.module.scss"

type Mode = "signin" | "signup"

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleGoogleLogin() {
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: "/" })
    } catch (err) {
      console.error("Google-Anmeldung fehlgeschlagen:", err)
      setError("Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.")
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password })

      if (authError) {
        setError(
          mode === "signup"
            ? "Registrierung fehlgeschlagen. E-Mail evtl. bereits vergeben oder Passwort zu kurz (mind. 8 Zeichen)."
            : "Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen."
        )
        return
      }

      window.location.href = "/"
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
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Image src="/notebook-logo.svg" alt="NotebookLM" width={1253} height={132} priority className={styles.logo} />

        <p className={styles.tagline}>Dein persönlicher KI-Assistent für Notizen</p>

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
          <input
            className={styles.input}
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "Bitte warten …" : mode === "signup" ? "Konto erstellen" : "Anmelden"}
          </button>
        </form>

        <button type="button" className={styles.toggle} onClick={toggleMode}>
          {mode === "signup" ? "Schon registriert? Anmelden" : "Noch kein Konto? Registrieren"}
        </button>

        <div className={styles.divider}>
          <span>oder</span>
        </div>

        <button type="button" className={styles.googleBtn} onClick={handleGoogleLogin}>
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
