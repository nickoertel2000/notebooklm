import { env } from "cloudflare:workers"
import { and, count, eq, inArray, like, sql } from "drizzle-orm"
import { getDb } from "@/db"
import { audioOverviews, MessageCitation, messages, notebooks, reports, session, sourceChunks, sources, user, videoOverviews } from "@/db/schema"
import { DEMO_INACTIVE_DAYS } from "@/lib/demoConfig"
import { deleteByPrefix, notebookPrefix } from "@/lib/storage"

// Chunks werden per INSERT … SELECT kopiert, damit die Embeddings nie durch den Worker laufen.
const CHUNK_BATCH = 500

const demoEmailPattern = () => `%@${env.DEMO_EMAIL_DOMAIN}`

export function demoEmail(suffix: string) {
  return `demo-${suffix}@${env.DEMO_EMAIL_DOMAIN}`
}

export async function countDemoAccounts(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(user).where(like(user.email, demoEmailPattern()))
  return row.n
}

// Kopiert alle Notebooks des Vorlage-Kontos (DEMO_TEMPLATE_EMAIL) in das Konto userId.
// Bewusst ohne getNotebookForUser: Die Vorlage gehört nicht dem neuen Konto, gelesen
// wird ausschließlich über die userId der Vorlage. Kopiert werden nur fertige Inhalte,
// die R2-Dateien bleiben bei der Vorlage (siehe deleteNotebookObject).
export async function cloneTemplateNotebooks(userId: string): Promise<void> {
  const db = getDb()
  const [template] = await db.select({ id: user.id }).from(user).where(eq(user.email, env.DEMO_TEMPLATE_EMAIL))
  if (!template) {
    console.error("Demo-Vorlage fehlt, das Demo-Konto startet leer")
    return
  }

  const templateNotebooks = await db.select().from(notebooks).where(eq(notebooks.userId, template.id))
  if (templateNotebooks.length === 0) return
  const notebookIds = templateNotebooks.map((n) => n.id)

  const [sourceRows, chunkRows, messageRows, reportRows, audioRows, videoRows] = await Promise.all([
    db
      .select()
      .from(sources)
      .where(and(inArray(sources.notebookId, notebookIds), eq(sources.status, "ready"))),
    db.select({ id: sourceChunks.id, sourceId: sourceChunks.sourceId }).from(sourceChunks).where(inArray(sourceChunks.notebookId, notebookIds)),
    db.select().from(messages).where(inArray(messages.notebookId, notebookIds)),
    db
      .select()
      .from(reports)
      .where(and(inArray(reports.notebookId, notebookIds), eq(reports.status, "ready"))),
    db
      .select()
      .from(audioOverviews)
      .where(and(inArray(audioOverviews.notebookId, notebookIds), eq(audioOverviews.status, "ready"))),
    db
      .select()
      .from(videoOverviews)
      .where(and(inArray(videoOverviews.notebookId, notebookIds), eq(videoOverviews.status, "ready")))
  ])

  const newId = new Map<string, string>()
  const mapId = (oldId: string) => {
    let id = newId.get(oldId)
    if (!id) newId.set(oldId, (id = crypto.randomUUID()))
    return id
  }
  const sourceNotebook = new Map(sourceRows.map((s) => [s.id, s.notebookId]))
  const chunks = chunkRows.filter((c) => sourceNotebook.has(c.sourceId))

  // Zitate verweisen auf Quellen und Chunks, deshalb auf die neuen IDs umschreiben.
  const remapCitations = (citations: MessageCitation[] | null) =>
    citations?.filter((c) => newId.has(c.sourceId) && newId.has(c.chunkId)).map((c) => ({ ...c, sourceId: mapId(c.sourceId), chunkId: mapId(c.chunkId) })) ?? null

  // createdAt bleibt erhalten: Die Tagesgrenze für Folienbilder zählt heute angelegte Videos.
  await db.transaction(async (tx) => {
    await tx.insert(notebooks).values(templateNotebooks.map((n) => ({ ...n, id: mapId(n.id), userId })))
    if (sourceRows.length > 0) {
      await tx.insert(sources).values(sourceRows.map((s) => ({ ...s, id: mapId(s.id), notebookId: mapId(s.notebookId) })))
    }

    for (let start = 0; start < chunks.length; start += CHUNK_BATCH) {
      const mapping = sql.join(
        chunks
          .slice(start, start + CHUNK_BATCH)
          .map((c) => sql`(${c.id}::uuid, ${mapId(c.id)}::uuid, ${mapId(c.sourceId)}::uuid, ${mapId(sourceNotebook.get(c.sourceId)!)}::uuid)`),
        sql`, `
      )
      await tx.execute(sql`
        insert into ${sourceChunks} (id, source_id, notebook_id, idx, content, embedding, page, char_start, char_end, created_at)
        select m.new_id, m.source_id, m.notebook_id, c.idx, c.content, c.embedding, c.page, c.char_start, c.char_end, c.created_at
        from ${sourceChunks} c join (values ${mapping}) as m(old_id, new_id, source_id, notebook_id) on c.id = m.old_id`)
    }

    if (messageRows.length > 0) {
      await tx
        .insert(messages)
        .values(messageRows.map((m) => ({ ...m, id: crypto.randomUUID(), notebookId: mapId(m.notebookId), citations: remapCitations(m.citations) })))
    }
    if (reportRows.length > 0) {
      await tx.insert(reports).values(reportRows.map((r) => ({ ...r, id: crypto.randomUUID(), notebookId: mapId(r.notebookId) })))
    }
    if (audioRows.length > 0) {
      await tx.insert(audioOverviews).values(audioRows.map((a) => ({ ...a, id: crypto.randomUUID(), notebookId: mapId(a.notebookId) })))
    }
    if (videoRows.length > 0) {
      await tx.insert(videoOverviews).values(videoRows.map((v) => ({ ...v, id: crypto.randomUUID(), notebookId: mapId(v.notebookId) })))
    }
  })
}

// Löscht Demo-Konten, deren letzte Session-Aktivität (ohne Session: Anlage) länger als
// DEMO_INACTIVE_DAYS zurückliegt. Eigene R2-Dateien zuerst, der Rest per Cascade.
export async function deleteInactiveDemoAccounts(): Promise<number> {
  const db = getDb()
  const stale = await db
    .select({ id: user.id })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .where(like(user.email, demoEmailPattern()))
    .groupBy(user.id)
    .having(sql`greatest(${user.createdAt}, coalesce(max(${session.updatedAt}), ${user.createdAt})) < now() - make_interval(days => ${DEMO_INACTIVE_DAYS})`)

  for (const { id } of stale) {
    const owned = await db.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.userId, id))
    for (const notebook of owned) await deleteByPrefix(notebookPrefix(notebook.id))
    await db.delete(user).where(eq(user.id, id))
  }
  return stale.length
}
