import { describe, expect, it } from "vitest"
import { readChatEvents } from "./chatStream"

describe("readChatEvents", () => {
  it("liest vollständige Zeilen und hält eine angefangene zurück", () => {
    const { events, rest } = readChatEvents('{"type":"text","text":"Hallo"}\n{"type":"text","te')
    expect(events).toEqual([{ type: "text", text: "Hallo" }])
    expect(rest).toBe('{"type":"text","te')
  })

  it("erkennt done und error", () => {
    const { events } = readChatEvents('{"type":"done","messageId":"m1","citations":[]}\n{"type":"error","error":"Kontingent"}\n')
    expect(events).toEqual([
      { type: "done", messageId: "m1", citations: [] },
      { type: "error", error: "Kontingent" }
    ])
  })

  it("überspringt leere, kaputte und unbekannte Zeilen", () => {
    const { events } = readChatEvents('\nkein json\n{"type":"ping"}\n{"type":"text"}\n')
    expect(events).toEqual([])
  })
})
