"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import "material-symbols"
import { authClient } from "@/auth-client"
import styles from "./accountMenu.module.scss"

type AccountMenuProps = {
  name: string
  email: string
  image?: string | null
}

export default function AccountMenu({ name, email, image }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const initial = name?.charAt(0).toUpperCase() || "?"
  const firstName = name?.trim().split(/\s+/)[0] || name
  const domain = email?.split("@")[1] ?? ""

  useEffect(() => {
    if (!open) return

    function handlePointer(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointer)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      router.push("/login")
      router.refresh()
    } catch (error) {
      console.error("Abmelden fehlgeschlagen:", error)
      setSigningOut(false)
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button className={styles.trigger} type="button" aria-label="Konto" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name || "Profil"} className={styles.triggerImg} />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <button className={styles.close} type="button" aria-label="Schließen" onClick={() => setOpen(false)}>
            <span className="material-symbols-outlined">close</span>
          </button>

          <p className={styles.email}>{email}</p>
          {domain && <p className={styles.managed}>Verwaltet von {domain}</p>}

          <a className={styles.adminLink} href="#" onClick={(e) => e.preventDefault()}>
            Admin-Konsole
          </a>

          <div className={styles.avatar}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={name || "Profil"} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarInitial}>{initial}</span>
            )}
            <span className={styles.cameraBadge}>
              <span className="material-symbols-outlined">photo_camera</span>
            </span>
          </div>

          <p className={styles.greeting}>Hallo {firstName}!</p>

          <button className={styles.manageBtn} type="button" onClick={(e) => e.preventDefault()}>
            Google-Konto verwalten
          </button>

          <div className={styles.actions}>
            <button className={styles.actionBtn} type="button">
              <span className="material-symbols-outlined">add</span>
              Konto hinzufügen
            </button>
            <button className={styles.actionBtn} type="button" onClick={handleSignOut} disabled={signingOut}>
              <span className="material-symbols-outlined">logout</span>
              Abmelden
            </button>
          </div>

          <div className={styles.footer}>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Datenschutzerklärung
            </a>
            <span className={styles.dot}>·</span>
            <a href="#" onClick={(e) => e.preventDefault()}>
              Nutzungsbedingungen
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
