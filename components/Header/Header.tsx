import Image from "next/image"
import Link from "next/link"
import { getSessionUser } from "@/lib/auth/session"
import AccountMenu from "./AccountMenu"
import styles from "./header.module.scss"

export default async function Header() {
  const user = await getSessionUser()

  return (
    <header className={styles.header}>
      <div className={styles.header__left}>
        <Link href="/" aria-label="Zur Startseite">
          <Image className={styles.header__logo} src="/notebook-logo.svg" alt="NotebookLM Klon" width={1253} height={132} priority />
        </Link>
      </div>

      <div className={styles.header__right}>
        <AccountMenu name={user?.name ?? ""} email={user?.email ?? ""} image={user?.image} />
      </div>
    </header>
  )
}
