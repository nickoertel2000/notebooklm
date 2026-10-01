import { expect, test } from "@playwright/test"
import postgres from "postgres"
import { MAX_NOTEBOOKS_PER_USER } from "../lib/demoConfig"
import { expectHome, register } from "./helpers"
import { testDatabaseUrl } from "./test-database"

test("Das Tageslimit pro Konto stoppt weitere Websuchen", async ({ page }) => {
  await register(page)
  await page.getByRole("button", { name: "Neu erstellen" }).click()
  await expect(page).toHaveURL(/\/notebook\/[0-9a-f-]+$/)
  const discover = `/api/notebooks/${page.url().split("/").pop()}/discover`

  // Das Kontingent wird vor dem Tavily-Aufruf gebucht. Mit dem Platzhalter-Key scheitert die Suche
  // selbst, jede Anfrage zählt trotzdem.
  for (let i = 0; i < 5; i++) {
    expect((await page.request.post(discover, { data: { query: `Suche ${i}` } })).status()).not.toBe(429)
  }

  const blocked = await page.request.post(discover, { data: { query: "Eine zu viel" } })
  expect(blocked.status()).toBe(429)
  expect(((await blocked.json()) as { error: string }).error).toContain("Tageslimit erreicht")
})

test("Die Obergrenze für Notebooks zeigt einen Hinweis statt ein weiteres anzulegen", async ({ page }) => {
  const account = await register(page)
  const sql = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    await sql`insert into notebooks (user_id) select id from "user", generate_series(1, ${MAX_NOTEBOOKS_PER_USER}::int) where email = ${account.email}`
  } finally {
    await sql.end()
  }

  await page.reload()
  await expectHome(page)
  await page.getByRole("button", { name: "Neu erstellen" }).click()
  await expect(page).toHaveURL(/\/\?hinweis=notebook-limit$/)
  await expect(page.getByRole("alert")).toContainText(`höchstens ${MAX_NOTEBOOKS_PER_USER} Notebooks`)
})
