import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test"
import postgres from "postgres"
import { expectHome, gotoPage, signInAsNewUser } from "./helpers"
import { templateIds } from "./seed-data"
import { testDatabaseUrl } from "./test-database"

type Ids = typeof templateIds
type RouteCall = { route: string; call: (api: APIRequestContext, ids: Ids) => Promise<APIResponse> }

const base = (ids: Ids) => `/api/notebooks/${ids.notebook}`
const pdf = { data: Buffer.from("%PDF-1.4"), headers: { "Content-Type": "application/pdf" } }

const notebookRoutes: RouteCall[] = [
  { route: "GET sources", call: (api, ids) => api.get(`${base(ids)}/sources`) },
  { route: "POST sources", call: (api, ids) => api.post(`${base(ids)}/sources`, { data: { type: "text", text: "Eingeschleust" } }) },
  { route: "POST sources/[sourceId]", call: (api, ids) => api.post(`${base(ids)}/sources/${ids.source}`) },
  { route: "DELETE sources/[sourceId]", call: (api, ids) => api.delete(`${base(ids)}/sources/${ids.source}`) },
  { route: "PUT sources/[sourceId]/file", call: (api, ids) => api.put(`${base(ids)}/sources/${ids.source}/file`, pdf) },
  { route: "POST chat", call: (api, ids) => api.post(`${base(ids)}/chat`, { data: { message: "Was steht in den Quellen?" } }) },
  { route: "POST discover", call: (api, ids) => api.post(`${base(ids)}/discover`, { data: { query: "Test" } }) },
  { route: "POST report-suggestions", call: (api, ids) => api.post(`${base(ids)}/report-suggestions`) },
  { route: "POST auto-title", call: (api, ids) => api.post(`${base(ids)}/auto-title`, { data: { force: true } }) },
  { route: "GET reports", call: (api, ids) => api.get(`${base(ids)}/reports`) },
  { route: "POST reports", call: (api, ids) => api.post(`${base(ids)}/reports`, { data: { type: "briefing" } }) },
  { route: "GET reports/[reportId]", call: (api, ids) => api.get(`${base(ids)}/reports/${ids.report}`) },
  { route: "DELETE reports/[reportId]", call: (api, ids) => api.delete(`${base(ids)}/reports/${ids.report}`) },
  { route: "GET audio", call: (api, ids) => api.get(`${base(ids)}/audio`) },
  { route: "POST audio", call: (api, ids) => api.post(`${base(ids)}/audio`, { data: { format: "brief" } }) },
  { route: "GET audio/[audioId]", call: (api, ids) => api.get(`${base(ids)}/audio/${ids.audio}`) },
  { route: "DELETE audio/[audioId]", call: (api, ids) => api.delete(`${base(ids)}/audio/${ids.audio}`) },
  { route: "GET audio/[audioId]/file", call: (api, ids) => api.get(`${base(ids)}/audio/${ids.audio}/file`) },
  { route: "GET video", call: (api, ids) => api.get(`${base(ids)}/video`) },
  { route: "POST video", call: (api, ids) => api.post(`${base(ids)}/video`, { data: { format: "summary", visualStyle: "auto" } }) },
  { route: "GET video/[videoId]", call: (api, ids) => api.get(`${base(ids)}/video/${ids.video}`) },
  { route: "DELETE video/[videoId]", call: (api, ids) => api.delete(`${base(ids)}/video/${ids.video}`) },
  { route: "GET video/[videoId]/file", call: (api, ids) => api.get(`${base(ids)}/video/${ids.video}/file`) }
]

// Alle exportierten Handler unter app/api/notebooks/[notebookId], z. B. "DELETE reports/[reportId]".
function declaredRoutes(): string[] {
  const root = path.join("app", "api", "notebooks", "[notebookId]")
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => path.basename(file) === "route.ts")
    .flatMap((file) => {
      const route = path.dirname(file).split(path.sep).join("/")
      const source = readFileSync(path.join(root, file), "utf8")
      return [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => `${m[1]} ${route}`)
    })
}

async function createNotebook(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Neu erstellen" }).click()
  await expect(page).toHaveURL(/\/notebook\/[0-9a-f-]+$/)
  return page.url().split("/").pop()!
}

test("Der Test deckt jede Notebook-Route ab", () => {
  expect(notebookRoutes.map((r) => r.route).sort()).toEqual(declaredRoutes().sort())
})

test("Notebooks anderer Nutzer und ihre Inhalte sind nicht erreichbar", async ({ page }) => {
  await signInAsNewUser(page)

  expect((await page.goto(`/notebook/${templateIds.notebook}`))?.status()).toBe(404)
  for (const { route, call } of notebookRoutes) {
    expect((await call(page.request, templateIds)).status(), route).toBe(404)
  }

  // Zweite Ebene: Kind-IDs aus fremden Notebooks werden auch über ein eigenes Notebook abgelehnt.
  await gotoPage(page, "/")
  await expectHome(page)
  const ownIds = { ...templateIds, notebook: await createNotebook(page) }
  for (const { route, call } of notebookRoutes.filter((r) => r.route.includes("Id]"))) {
    expect((await call(page.request, ownIds)).status(), `eigenes Notebook: ${route}`).toBe(404)
  }

  const sql = postgres(testDatabaseUrl, { max: 1 })
  try {
    const [rows] = await sql`
      select
        (select count(*) from sources where notebook_id = ${templateIds.notebook})::int as sources,
        (select status from sources where id = ${templateIds.source}) as "sourceStatus",
        (select count(*) from reports where notebook_id = ${templateIds.notebook})::int as reports,
        (select count(*) from audio_overviews where notebook_id = ${templateIds.notebook})::int as audios,
        (select count(*) from video_overviews where notebook_id = ${templateIds.notebook})::int as videos`
    expect(rows).toEqual({ sources: 1, sourceStatus: "ready", reports: 1, audios: 1, videos: 1 })
  } finally {
    await sql.end()
  }
})

test("Ohne Anmeldung liefern die Notebook-Routen keine Daten", async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: "http://localhost:3000", maxRedirects: 0 })
  for (const { route, call } of notebookRoutes) {
    expect([307, 401], route).toContain((await call(api, templateIds)).status())
  }
  await api.dispose()
})
