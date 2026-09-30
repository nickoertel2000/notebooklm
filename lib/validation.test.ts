import { describe, expect, it } from "vitest"
import { optionalString, parseSourceIds, readJsonBody } from "./api/body"
import { stripNul, toErrorMessage } from "./jobs/errors"
import { isUuid } from "./notebooks"
import { hostOf } from "./url"

const NUL = String.fromCharCode(0)

const request = (body: string) => new Request("http://localhost/", { method: "POST", body })

describe("readJsonBody", () => {
  it("liefert nur JSON-Objekte, sonst ein leeres Objekt", async () => {
    expect(await readJsonBody(request('{"a":1}'))).toEqual({ a: 1 })
    expect(await readJsonBody(request("[1,2]"))).toEqual({})
    expect(await readJsonBody(request("null"))).toEqual({})
    expect(await readJsonBody(request("kein JSON"))).toEqual({})
  })
})

describe("optionalString", () => {
  it("trimmt Text und macht Leeres zu null", () => {
    expect(optionalString("  Fokus ")).toBe("Fokus")
    expect(optionalString("   ")).toBeNull()
    expect(optionalString(42)).toBeNull()
  })
})

describe("parseSourceIds", () => {
  it("behält nur Strings und liefert null ohne Array", () => {
    expect(parseSourceIds(["a", 1, null, "b"])).toEqual(["a", "b"])
    expect(parseSourceIds("a")).toBeNull()
  })
})

describe("isUuid", () => {
  it("akzeptiert nur UUIDs", () => {
    expect(isUuid("3f2b8c1e-9d4a-4e6b-8f0c-1a2b3c4d5e6f")).toBe(true)
    expect(isUuid("3F2B8C1E-9D4A-4E6B-8F0C-1A2B3C4D5E6F")).toBe(true)
    expect(isUuid("123")).toBe(false)
    expect(isUuid("3f2b8c1e-9d4a-4e6b-8f0c-1a2b3c4d5e6f' OR 1=1")).toBe(false)
  })
})

describe("stripNul und toErrorMessage", () => {
  it("entfernt NUL-Bytes, die Postgres ablehnt", () => {
    expect(stripNul(`a${NUL}b${NUL}`)).toBe("ab")
  })

  it("macht aus beliebigen Fehlern eine gekürzte Meldung ohne NUL-Bytes", () => {
    expect(toErrorMessage(new Error(`kaputt${NUL}`))).toBe("kaputt")
    expect(toErrorMessage("nur Text")).toBe("nur Text")
    expect(toErrorMessage(new Error("x".repeat(600)))).toHaveLength(500)
  })
})

describe("hostOf", () => {
  it("liefert den Host ohne www und bei ungültiger URL die Eingabe", () => {
    expect(hostOf("https://www.example.com/pfad?x=1")).toBe("example.com")
    expect(hostOf("kein link")).toBe("kein link")
  })
})
