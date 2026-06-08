import Image from "next/image"
import "material-symbols/outlined.css"
import { headers } from "next/headers"
import { auth } from "@/auth"
import AccountMenu from "./AccountMenu"
import styles from "./header.module.scss"

export default async function Header() {
  const session = await auth.api.getSession({ headers: await headers() })
  const user = session?.user

  return (
    <header className={styles.header}>
      <div className={styles.header__left}>
        <Image className={styles.header__logo} src="/notebook-logo.svg" alt="NotebookLM" width={1253} height={132} priority />
      </div>

      <div className={styles.header__right}>
        <button className={styles.header__settings} type="button">
          <span className={`${styles["header__settings-icon"]} material-symbols-outlined`}>settings</span>
          <span>Einstellungen</span>
        </button>

        <button className={styles.header__apps} type="button" aria-label="Google Apps">
          <span className="material-symbols-outlined">apps</span>
        </button>

        <AccountMenu name={user?.name ?? ""} email={user?.email ?? ""} image={user?.image} />
      </div>
    </header>
  )
}
