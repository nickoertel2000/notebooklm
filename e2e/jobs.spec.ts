import { expect, test } from "@playwright/test"
import postgres from "postgres"
import { signInAsNewUser } from "./helpers"
import { testDatabaseUrl } from "./test-database"

test("Hängende Jobs erscheinen als fehlgeschlagen, ohne dass ein GET schreibt", async ({ page }) => {
  const account = await signInAsNewUser(page)
  const sql = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    const [notebook] = await sql<{ id: string }[]>`
      insert into notebooks (user_id) select id from "user" where email = ${account.email} returning id`
    const [source] = await sql<{ id: string }[]>`
      insert into sources (notebook_id, type, title, storage_key, status, updated_at)
      values (${notebook.id}, 'text', 'Hängt', 'notebooks/x/sources/y/content.txt', 'processing', now() - interval '20 minutes')
      returning id`
    await sql`
      insert into reports (notebook_id, type, title, status, created_at)
      values (${notebook.id}, 'briefing', 'Hängt auch', 'processing', now() - interval '15 minutes')`

    const base = `/api/notebooks/${notebook.id}`
    const sources = (await (await page.request.get(`${base}/sources`)).json()) as { sources: { status: string; error: string | null }[] }
    expect(sources.sources[0]).toMatchObject({ status: "failed", error: "Zeitüberschreitung beim Import" })
    const reports = (await (await page.request.get(`${base}/reports`)).json()) as { reports: { status: string }[] }
    expect(reports.reports[0].status).toBe("failed")

    const [row] = await sql<{ status: string }[]>`select status from sources where id = ${source.id}`
    expect(row.status).toBe("processing")

    // Ein erneuter Import ist auch für eine hängende Quelle erlaubt, nicht nur für failed in der DB.
    expect((await page.request.post(`${base}/sources/${source.id}`)).status()).not.toBe(409)
  } finally {
    await sql.end()
  }
})
