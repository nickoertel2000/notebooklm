"use client"

import { useEffect, useImperativeHandle, useRef, type Ref } from "react"
import type { TurnstileAction } from "@/lib/turnstileConfig"
import styles from "./Turnstile.module.scss"

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type TurnstileHandle = { reset: () => void }

type TurnstileProps = {
  action: TurnstileAction
  onToken: (token: string | null) => void
  onError: (message: string) => void
  ref?: Ref<TurnstileHandle>
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile nicht verfügbar")))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Turnstile konnte nicht geladen werden"))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

// Unsichtbar, solange Cloudflare den Besucher ohne Rückfrage einstuft. Tokens gelten nur einmal,
// nach jedem Request muss der Aufrufer reset() aufrufen.
const LOAD_ERROR = "Die Sicherheitsprüfung konnte nicht geladen werden. Bitte lade die Seite neu oder deaktiviere den Werbeblocker für diese Seite."

export default function Turnstile({ action, onToken, onError, ref }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onTokenRef.current = onToken
    onErrorRef.current = onError
  }, [onToken, onError])

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null)
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current)
    }
  }))

  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!sitekey) return
    let cancelled = false

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey,
          action,
          "appearance": "interaction-only",
          "language": "de",
          "callback": (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            onTokenRef.current(null)
            onErrorRef.current(LOAD_ERROR)
          }
        })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) onErrorRef.current(LOAD_ERROR)
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [action])

  return <div ref={containerRef} className={styles.widget} />
}
