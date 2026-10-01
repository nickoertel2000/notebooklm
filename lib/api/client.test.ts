import { describe, expect, it } from "vitest"
import { errorMessage, readError, UserError } from "./client"

describe("errorMessage", () => {
  it("zeigt nur Meldungen für Nutzer, sonst den Fallback", () => {
    expect(errorMessage(new UserError("Tageslimit erreicht"), "Fallback")).toBe("Tageslimit erreicht")
    expect(errorMessage(new TypeError("Failed to fetch"), "Fallback")).toBe("Fallback")
    expect(errorMessage(new SyntaxError("Unexpected token <"), "Fallback")).toBe("Fallback")
    expect(errorMessage(new UserError(""), "Fallback")).toBe("Fallback")
    expect(errorMessage("kaputt", "Fallback")).toBe("Fallback")
  })
})

describe("readError", () => {
  it("liest error aus der Antwort und fällt sonst zurück", async () => {
    expect(await readError(Response.json({ error: "Nicht angemeldet" }, { status: 401 }), "Fallback")).toBe("Nicht angemeldet")
    expect(await readError(new Response("<html>", { status: 502 }), "Fallback")).toBe("Fallback")
  })
})
