"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getDb } from "@/db"
import { audioOverviews, notebooks, reports, videoOverviews } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { pickNotebookEmoji } from "@/lib/notebookIcons"
import { getNotebookForUser } from "@/lib/notebooks"
import { cancelJob } from "@/lib/jobs/start"
import { deleteByPrefix, notebookPrefix } from "@/lib/storage"

// Legt ein neues Notebook für den aktuellen User an und leitet darauf weiter.
export async function createNotebook() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [row] = await getDb().insert(notebooks).values({ userId: user.id }).returning({ id: notebooks.id })

  redirect(`/notebook/${row.id}`)
}

// Löscht ein Notebook samt aller Daten (Quellen + Chunks via FK-Kaskade, Dateien per Prefix).
export async function deleteNotebook(notebookId: string) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return

  const db = getDb()
  const processing = (table: typeof reports | typeof audioOverviews | typeof videoOverviews) =>
    db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.notebookId, notebookId), eq(table.status, "processing")))
  const [runningReports, runningAudios, runningVideos] = await Promise.all([processing(reports), processing(audioOverviews), processing(videoOverviews)])
  await Promise.all([
    ...runningReports.map((r) => cancelJob("report", r.id)),
    ...runningAudios.map((a) => cancelJob("audio", a.id)),
    ...runningVideos.map((v) => cancelJob("video", v.id))
  ])

  try {
    await deleteByPrefix(notebookPrefix(notebookId))
  } catch (err) {
    console.error("Dateien des Notebooks konnten nicht gelöscht werden:", err)
  }

  await db.delete(notebooks).where(eq(notebooks.id, notebookId))

  revalidatePath("/")
}

// Ändert den Titel eines Notebooks.
export async function renameNotebook(notebookId: string, title: string) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const trimmed = title.trim()
  if (!trimmed) return null

  // Zum neuen Titel automatisch ein passendes Icon aus der Bibliothek wählen.
  const emoji = await pickNotebookEmoji(trimmed)

  await getDb()
    .update(notebooks)
    .set({ title: trimmed, ...(emoji ? { emoji } : {}), updatedAt: new Date() })
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id)))

  revalidatePath("/")
  // Das gewählte Emoji zurückgeben, damit der Header es sofort anzeigen kann.
  return emoji
}
