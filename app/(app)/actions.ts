"use server"

import { and, count, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getDb } from "@/db"
import { audioOverviews, notebooks, reports, videoOverviews } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { MAX_LENGTH } from "@/lib/api/body"
import { pickNotebookEmoji } from "@/lib/notebookIcons"
import { getNotebookForUser } from "@/lib/notebooks"
import { cancelJob } from "@/lib/jobs/start"
import { checkRateLimit, consumeQuota, MAX_NOTEBOOKS_PER_USER } from "@/lib/quota"
import { deleteByPrefix, notebookPrefix } from "@/lib/storage"

export async function createNotebook() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const db = getDb()
  const [{ n }] = await db.select({ n: count() }).from(notebooks).where(eq(notebooks.userId, user.id))
  if (n >= MAX_NOTEBOOKS_PER_USER) redirect("/?hinweis=notebook-limit")
  if (await checkRateLimit(user.id)) redirect("/?hinweis=rate-limit")

  const [row] = await db.insert(notebooks).values({ userId: user.id }).returning({ id: notebooks.id })

  redirect(`/notebook/${row.id}`)
}

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

export async function renameNotebook(notebookId: string, title: string) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const trimmed = title.trim().slice(0, MAX_LENGTH.title)
  if (!trimmed) return null
  if (!(await getNotebookForUser(notebookId, user.id))) return null

  const emoji = (await consumeQuota(user.id, "assist")) ? null : await pickNotebookEmoji(trimmed)

  await getDb()
    .update(notebooks)
    .set({ title: trimmed, ...(emoji ? { emoji } : {}), updatedAt: new Date() })
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, user.id)))

  revalidatePath("/")
  return emoji
}
