import { expect, test } from "@playwright/test"
import { createAccount, gotoPage, signIn, signInAsNewUser } from "./helpers"

test("Anmelden, abmelden und wieder anmelden", async ({ page }) => {
  const account = await signInAsNewUser(page)

  await page.getByRole("button", { name: "Konto", exact: true }).click()
  await page.getByRole("button", { name: "Abmelden" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, account)
})

test("Falsches Passwort wird abgelehnt", async ({ page }) => {
  const account = await createAccount()

  await gotoPage(page, "/login")
  await page.getByPlaceholder("E-Mail").fill(account.email)
  await page.getByPlaceholder("Passwort").fill("falsches-passwort")
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page.getByText("Anmeldung fehlgeschlagen")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test("Die Login-Seite bietet keine Registrierung an", async ({ page }) => {
  await gotoPage(page, "/login")
  await expect(page.getByRole("button", { name: "Demo-Zugang erstellen" })).toBeVisible()
  await expect(page.getByText(/registrieren|konto erstellen/i)).toHaveCount(0)
})

test("Registrierung über die API ist gesperrt, der Demo-Zugang verlangt die Sicherheitsprüfung", async ({ request }) => {
  const signup = await request.post("/api/auth/sign-up/email", {
    data: { name: "Bot", email: `bot-${Date.now()}@example.test`, password: "Passwort-123" },
    headers: { Origin: "http://localhost:3000" }
  })
  expect(signup.status()).toBe(403)

  const demo = await request.post("/api/demo")
  expect(demo.status()).toBe(403)
})
