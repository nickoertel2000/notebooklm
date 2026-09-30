import Image from "next/image"
import Link from "next/link"
import "material-symbols"
import AccountMenu from "@/components/Header/AccountMenu"
import { createNotebook, renameNotebook } from "@/app/(app)/actions"
import NotebookTitle from "./NotebookTitle"
import styles from "./notebookHeader.module.scss"

type NotebookHeaderProps = {
  notebookId: string
  title: string
  emoji: string
  user: { name?: string | null; email?: string | null; image?: string | null }
}

export default function NotebookHeader({ notebookId, title, emoji, user }: NotebookHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href="/" className={styles.logo} aria-label="Zur Startseite">
          <Image src="/notebook-icon.svg" alt="" width={32} height={32} priority />
        </Link>
        <NotebookTitle notebookId={notebookId} initialTitle={title} initialEmoji={emoji} onRename={renameNotebook} />
      </div>

      <div className={styles.right}>
        <form action={createNotebook}>
          <button type="submit" className={styles.createBtn}>
            <span className="material-symbols-outlined">add</span>
            Notebook erstellen
          </button>
        </form>

        <AccountMenu name={user.name ?? ""} email={user.email ?? ""} image={user.image} />
      </div>
    </header>
  )
}
