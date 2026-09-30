import { expect, test } from "@playwright/test"
import { expectHome, gotoPage, register } from "./helpers"

test("Registrieren, abmelden und wieder anmelden", async ({ page }) => {
  const account = await register(page)

  await page.getByRole("button", { name: "Konto", exact: true }).click()
  await page.getByRole("button", { name: "Abmelden" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByPlaceholder("E-Mail").fill(account.email)
  await page.getByPlaceholder("Passwort").fill(account.password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expectHome(page)
})

test("Falsches Passwort wird abgelehnt", async ({ page }) => {
  const account = await register(page)
  await page.context().clearCookies()

  await gotoPage(page, "/login")
  await page.getByPlaceholder("E-Mail").fill(account.email)
  await page.getByPlaceholder("Passwort").fill("falsches-passwort")
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page.getByText("Anmeldung fehlgeschlagen")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
