import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { unstable_readConfig } from "wrangler"
import { audioOverviews, messages, notebooks, reports, sourceChunks, sources, user, videoOverviews } from "../db/schema"
import { demoNotebook, templateIds } from "./seed-data"
import { startTestDatabase, stopTestDatabase, testDatabaseUrl } from "./test-database"

export default async function globalSetup() {
  startTestDatabase()
  const client = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: "db/migrations" })
    await seedDemoTemplate(db)
  } finally {
    await client.end()
  }
  return stopTestDatabase
}

// Die Vorlage, die POST /api/demo in jedes neue Demo-Konto kopiert. Ohne Embedding,
// die Tests stellen keine neuen Fragen.
async function seedDemoTemplate(db: PostgresJsDatabase) {
  const email = String(unstable_readConfig({ config: "wrangler.jsonc" }).vars.DEMO_TEMPLATE_EMAIL)
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
  if (existing) return

  await db.transaction(async (tx) => {
    const now = new Date()
    const userId = randomUUID()
    await tx.insert(user).values({ id: userId, name: "Demo-Vorlage", email, emailVerified: false, createdAt: now, updatedAt: now })

    const [notebook] = await tx
      .insert(notebooks)
      .values({ id: templateIds.notebook, userId, title: demoNotebook.title, emoji: "🌱" })
      .returning({ id: notebooks.id })
    const [source] = await tx
      .insert(sources)
      .values({
        id: templateIds.source,
        notebookId: notebook.id,
        type: "text",
        title: demoNotebook.sourceTitle,
        status: "ready",
        charCount: demoNotebook.snippet.length
      })
      .returning({ id: sources.id })
    const [chunk] = await tx
      .insert(sourceChunks)
      .values({ sourceId: source.id, notebookId: notebook.id, idx: 0, content: demoNotebook.snippet, charStart: 0, charEnd: demoNotebook.snippet.length })
      .returning({ id: sourceChunks.id })

    await tx.insert(messages).values([
      { notebookId: notebook.id, role: "user", content: demoNotebook.question, createdAt: new Date(now.getTime() - 1000) },
      {
        notebookId: notebook.id,
        role: "assistant",
        content: demoNotebook.answer,
        citations: [
          { marker: 1, sourceId: source.id, chunkId: chunk.id, snippet: demoNotebook.snippet, page: null, charStart: 0, charEnd: demoNotebook.snippet.length }
        ],
        createdAt: now
      }
    ])

    // Ohne Dateien in R2: Die Tests prüfen nur, dass fremde Nutzer die Einträge nicht erreichen.
    await tx
      .insert(reports)
      .values({ id: templateIds.report, notebookId: notebook.id, type: "briefing", title: "Überblick", content: "Kurzfassung", status: "ready" })
    await tx.insert(audioOverviews).values({ id: templateIds.audio, notebookId: notebook.id, format: "brief", title: "Zusammenfassung", status: "ready" })
    await tx.insert(videoOverviews).values({ id: templateIds.video, notebookId: notebook.id, format: "summary", title: "Zusammenfassung", status: "ready" })
  })
}
