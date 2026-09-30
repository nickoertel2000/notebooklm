import { ApiError } from "@google/genai"
import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { chatModels, geminiErrorMessage, withFallback } from "./gemini"

const apiError = (status: number) => new ApiError({ message: `Status ${status}`, status })

describe("withFallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("nimmt das erste Modell, wenn es antwortet", async () => {
    const run = vi.fn(async (model: string) => model)
    await expect(withFallback(["a", "b"], run)).resolves.toBe("a")
    expect(run).toHaveBeenCalledTimes(1)
  })

  it.each([429, 503])("weicht bei Status %i auf das nächste Modell aus", async (status) => {
    const run = vi.fn(async (model: string) => {
      if (model !== "c") throw apiError(status)
      return model
    })
    await expect(withFallback(["a", "b", "c"], run)).resolves.toBe("c")
    expect(run.mock.calls.map(([model]) => model)).toEqual(["a", "b", "c"])
  })

  it("bricht bei anderen Fehlern sofort ab", async () => {
    const run = vi.fn(async () => {
      throw apiError(400)
    })
    await expect(withFallback(["a", "b"], run)).rejects.toThrow("Status 400")
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("wirft den Fehler des letzten Modells, wenn alle ausgeschöpft sind", async () => {
    const run = vi.fn(async (model: string) => {
      throw new ApiError({ message: `${model} ausgeschöpft`, status: 429 })
    })
    await expect(withFallback(["a", "b"], run)).rejects.toThrow("b ausgeschöpft")
  })

  it("wirft ohne konfigurierte Modelle", async () => {
    await expect(withFallback([], async () => "x")).rejects.toThrow("Keine Gemini-Modelle")
  })
})

describe("chatModels", () => {
  it("liest die Kette komma-getrennt und ignoriert Leerraum und leere Einträge", () => {
    Object.assign(env, { GEMINI_CHAT_MODELS: " modell-a, modell-b ,," })
    expect(chatModels()).toEqual(["modell-a", "modell-b"])
  })
})

describe("geminiErrorMessage", () => {
  it("unterscheidet Überlastung, Kontingent und sonstige Fehler", () => {
    expect(geminiErrorMessage(apiError(503))).toContain("überlastet")
    expect(geminiErrorMessage(apiError(429))).toContain("kontingent")
    expect(geminiErrorMessage(new Error("geheim"))).not.toContain("geheim")
  })
})
