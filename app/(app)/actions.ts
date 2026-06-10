"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { notebooks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"
import { deleteByPrefix } from "@/lib/s3"

// Legt ein neues Notebook für den aktuellen User an und leitet darauf weiter.
export async function createNotebook() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [row] = await db.insert(notebooks).values({ userId: user.id }).returning({ id: notebooks.id })

  redirect(`/notebook/${row.id}`)
}

// Löscht ein Notebook samt aller Daten (Quellen + Chunks via FK-Kaskade, S3-Objekte per Prefix).
export async function deleteNotebook(notebookId: string) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return

  // Alle S3-Objekte des Notebooks (Originale + extrahierte Texte) entfernen.
  try {
    await deleteByPrefix(`notebooks/${notebookId}/`)
  } catch (err) {
    console.error("S3-Daten des Notebooks konnten nicht gelöscht werden:", err)
  }

  await db.delete(notebooks).where(eq(notebooks.id, notebookId))

  revalidatePath("/")
}

// Ändert den Titel eines Notebooks.
export async function renameNotebook(notebookId: string, title: string) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const trimmed = title.trim()
  if (!trimmed) return

  await db
    .update(notebooks)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id)))

  revalidatePath("/")
}
