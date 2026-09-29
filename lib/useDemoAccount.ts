import { useSyncExternalStore } from "react"

// Zugangsdaten des eigenen Demo-Kontos, damit Besucher innerhalb der Frist zurückkommen.
// Nur eine Komfortfunktion: Ohne Browser-Speicher bleibt der Demo-Zugang nutzbar.
const STORAGE_KEY = "notebooklm-demo-account"
const CHANGE_EVENT = "notebooklm-demo-account-change"

export type DemoAccount = { email: string; password: string }

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function parse(raw: string | null): DemoAccount | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<DemoAccount>
    return typeof value.email === "string" && typeof value.password === "string" ? { email: value.email, password: value.password } : null
  } catch {
    return null
  }
}

export function saveDemoAccount(account: DemoAccount | null) {
  try {
    if (account) localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Privater Modus o. Ä.: dann eben ohne Wiedererkennung.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useDemoAccount(): DemoAccount | null {
  return parse(useSyncExternalStore(subscribe, readRaw, () => null))
}
