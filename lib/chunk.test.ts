import { describe, expect, it } from "vitest"
import { chunkText } from "./chunk"

describe("chunkText", () => {
  it("liefert für leeren oder nur aus Leerzeichen bestehenden Text keine Chunks", () => {
    expect(chunkText("")).toEqual([])
    expect(chunkText("   \n\n  ")).toEqual([])
  })

  it("gibt kurzen Text als einen Chunk zurück", () => {
    expect(chunkText("Hallo Welt")).toEqual([{ idx: 0, content: "Hallo Welt", charStart: 0, charEnd: 10, page: null }])
  })

  it("normalisiert Windows- und alte Mac-Zeilenumbrüche", () => {
    expect(chunkText("a\r\nb\rc")[0].content).toBe("a\nb\nc")
  })

  it("zerlegt langen Text in überlappende Chunks, die den ganzen Text abdecken", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Das ist Satz Nummer ${i}.`).join(" ")
    const chunks = chunkText(text)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].charStart).toBe(0)
    expect(chunks.at(-1)!.charEnd).toBe(text.length)
    chunks.forEach((chunk, i) => {
      expect(chunk.idx).toBe(i)
      expect(chunk.content.length).toBeLessThanOrEqual(3200)
      if (i > 0) expect(chunk.charStart).toBeLessThan(chunks[i - 1].charEnd)
    })
  })

  it("schneidet bevorzugt an Satzgrenzen", () => {
    const text = "Das ist ein Satz. ".repeat(20)
    const [first] = chunkText(text, { maxChars: 100, overlapChars: 20 })
    expect(first.content.endsWith(".")).toBe(true)
  })

  it("kommt auch bei Überlappung größer als die Chunk-Länge voran", () => {
    const chunks = chunkText("x".repeat(50), { maxChars: 10, overlapChars: 20 })
    expect(chunks.at(-1)!.charEnd).toBe(50)
  })
})
