import Image from "next/image"
import "material-symbols/outlined.css"
import styles from "./header.module.scss"

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.header__left}>
        <Image className={styles.header__logo} src="/notebook-logo.svg" alt="NotebookLM" width={244} height={26} priority />
      </div>

      <div className={styles.header__right}>
        <button className={styles.header__settings} type="button">
          <span className={`${styles["header__settings-icon"]} material-symbols-outlined`}>settings</span>
          <span>Einstellungen</span>
        </button>

        <button className={styles.header__apps} type="button" aria-label="Google Apps">
          <span className="material-symbols-outlined">apps</span>
        </button>

        <button className={styles.header__avatar} type="button" aria-label="Konto">
          N
        </button>
      </div>
    </header>
  )
}
