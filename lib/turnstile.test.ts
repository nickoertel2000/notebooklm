import { describe, expect, it } from "vitest"
import { isValidSiteverify } from "./turnstile"

const host = "notebooklm.example.dev"

describe("isValidSiteverify", () => {
  it("verlangt Erfolg, passende Action und den eigenen Hostnamen", () => {
    expect(isValidSiteverify({ success: true, action: "demo", hostname: host }, "demo", host)).toBe(true)
    expect(isValidSiteverify({ success: false, action: "demo", hostname: host }, "demo", host)).toBe(false)
    expect(isValidSiteverify({ success: true, action: "login", hostname: host }, "demo", host)).toBe(false)
    expect(isValidSiteverify({ success: true, action: "demo", hostname: "angreifer.example" }, "demo", host)).toBe(false)
  })

  it("akzeptiert Ergebnisse von Test-Keys nur lokal", () => {
    const testResult = { success: true, hostname: "example.com", metadata: { result_with_testing_key: true } }
    expect(isValidSiteverify(testResult, "demo", "localhost")).toBe(true)
    expect(isValidSiteverify(testResult, "demo", host)).toBe(false)
  })
})
