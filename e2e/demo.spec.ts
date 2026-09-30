import { expect, test } from "@playwright/test"
import { expectHome } from "./helpers"
import { demoNotebook } from "./seed-data"

test("Demo-Zugang mit Beispiel-Notebook und Zitat", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: "Demo-Zugang erstellen" }).click()
  await expect(page.getByText("Deine Demo-Zugangsdaten sind eingetragen")).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expectHome(page)

  await page.getByRole("link", { name: demoNotebook.title }).click()
  await expect(page.getByText(demoNotebook.question)).toBeVisible()

  const chip = page.getByRole("button", { name: `Zitat 1: ${demoNotebook.sourceTitle}` })
  await chip.hover()
  await expect(page.getByRole("tooltip")).toContainText(demoNotebook.snippet)

  await chip.click()
  await expect(page.getByRole("listitem").filter({ hasText: demoNotebook.sourceTitle })).toHaveClass(/sourceItemActive/)
})
