import { describe, expect, it } from "vitest"
import { replacePlaceholder } from "./placeholders"

describe("replacePlaceholder", () => {
  it("ersetzt den Platzhalter an seiner Position", () => {
    expect(replacePlaceholder([{ id: "temp-1" }, { id: "a" }], "temp-1", { id: "b" })).toEqual([{ id: "b" }, { id: "a" }])
  })

  it("verhindert einen doppelten Eintrag, wenn ein Poll die Zeile schon geliefert hat", () => {
    expect(replacePlaceholder([{ id: "temp-1" }, { id: "b" }, { id: "a" }], "temp-1", { id: "b" })).toEqual([{ id: "b" }, { id: "a" }])
  })
})
