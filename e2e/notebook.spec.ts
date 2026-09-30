import { expect, test } from "@playwright/test"
import { register } from "./helpers"

test("Notebook anlegen und Text-Quelle hinzufügen", async ({ page }) => {
  await register(page)

  await page.getByRole("button", { name: "Neu erstellen" }).click()
  await expect(page).toHaveURL(/\/notebook\/[0-9a-f-]+$/)
  await expect(page.getByRole("button", { name: "Unbenanntes Notebook" })).toBeVisible()

  await page.getByRole("button", { name: "Quellen hinzufügen" }).click()
  await page.getByRole("button", { name: "Text einfügen" }).click()
  await page.getByPlaceholder("Titel (optional)").fill("Meine Notizen")
  await page.getByPlaceholder("Text hier einfügen…").fill("Die Mitochondrien sind die Kraftwerke der Zelle.")
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click()

  // Nur das Anlegen: Die Ingestion bräuchte Gemini-Embeddings und scheitert in der CI im Hintergrund.
  await expect(page.getByRole("listitem").filter({ hasText: "Meine Notizen" })).toBeVisible()
})
