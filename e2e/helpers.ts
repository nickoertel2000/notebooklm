import { randomUUID } from "node:crypto"
import { expect, type Page } from "@playwright/test"
import { hashPassword } from "better-auth/crypto"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { account, user } from "../db/schema"
import { testDatabaseUrl } from "./test-database"

export type Account = { name: string; email: string; password: string }

// Der Dev-Server kompiliert den Client-Code erst beim ersten Aufruf, Klicks vor der Hydration gehen verloren.
// React hängt beim Hydrieren interne Schlüssel an jedes DOM-Element, auch an <body> aus dem Root-Layout.
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => Object.keys(document.body).some((key) => key.startsWith("__reactFiber")))
}

export async function gotoPage(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

// Die App hat keine Registrierung, und der Demo-Zugang erlaubt nur zwei Konten pro Minute.
// Deshalb legt der Test das Konto so in der Test-DB an, wie Better Auth es selbst speichern würde.
export async function createAccount(): Promise<Account> {
  const id = randomUUID().slice(0, 8)
  const created = { name: `E2E ${id}`, email: `e2e-${id}@example.test`, password: `Passwort-${id}` }

  const client = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} })
  try {
    const db = drizzle(client)
    const userId = randomUUID()
    const now = new Date()
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id: userId, name: created.name, email: created.email, emailVerified: false, createdAt: now, updatedAt: now })
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(created.password),
        createdAt: now,
        updatedAt: now
      })
    })
  } finally {
    await client.end()
  }
  return created
}

export async function signIn(page: Page, credentials: Account) {
  await gotoPage(page, "/login")
  await page.getByPlaceholder("E-Mail").fill(credentials.email)
  await page.getByPlaceholder("Passwort").fill(credentials.password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expectHome(page)
}

export async function signInAsNewUser(page: Page): Promise<Account> {
  const created = await createAccount()
  await signIn(page, created)
  return created
}

export async function expectHome(page: Page) {
  await expect(page.getByRole("heading", { name: "Zuletzt geöffnete Notebooks" })).toBeVisible()
  await waitForHydration(page)
}
