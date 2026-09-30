import { randomUUID } from "node:crypto"
import { expect, type Page } from "@playwright/test"

export type Account = { name: string; email: string; password: string }

export async function register(page: Page): Promise<Account> {
  const id = randomUUID().slice(0, 8)
  const account = { name: `E2E ${id}`, email: `e2e-${id}@example.test`, password: `Passwort-${id}` }

  await page.goto("/login")
  await page.getByRole("button", { name: "Noch kein Konto? Registrieren" }).click()
  await page.getByPlaceholder("Nutzername").fill(account.name)
  await page.getByPlaceholder("E-Mail").fill(account.email)
  await page.getByPlaceholder("Passwort").fill(account.password)
  await page.getByRole("button", { name: "Konto erstellen" }).click()
  await expectHome(page)
  return account
}

export async function expectHome(page: Page) {
  await expect(page.getByRole("heading", { name: "Zuletzt geöffnete Notebooks" })).toBeVisible()
}
