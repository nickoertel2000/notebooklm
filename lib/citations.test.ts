import { describe, expect, it } from "vitest"
import { extractCitations, snippetOf, type RetrievedChunk } from "./citations"

const chunk = (n: number): RetrievedChunk => ({
  chunkId: `chunk-${n}`,
  sourceId: `source-${n}`,
  content: `Inhalt   von\nChunk ${n}`,
  sourceTitle: `Quelle ${n}`,
  page: null,
  charStart: n * 100,
  charEnd: n * 100 + 50
})

const retrieved = [chunk(1), chunk(2), chunk(3)]

describe("extractCitations", () => {
  it("ordnet [n] dem n-ten abgerufenen Chunk zu, in Reihenfolge des ersten Auftretens", () => {
    const citations = extractCitations("A [1]. B [3][1]. C [2, 3].", retrieved)

    expect(citations.map((c) => c.marker)).toEqual([1, 3, 2])
    expect(citations[1]).toEqual({
      marker: 3,
      sourceId: "source-3",
      chunkId: "chunk-3",
      snippet: "Inhalt von Chunk 3",
      page: null,
      charStart: 300,
      charEnd: 350
    })
  })

  it("ignoriert Nummern ohne passenden Chunk", () => {
    expect(extractCitations("Erfunden [0] und [9].", retrieved)).toEqual([])
  })

  it("liefert ohne Marker keine Zitate", () => {
    expect(extractCitations("Antwort ohne Belege.", retrieved)).toEqual([])
  })
})

describe("snippetOf", () => {
  it("fasst Leerraum zusammen und lässt kurze Texte sonst unverändert", () => {
    expect(snippetOf("  kurzer \n\n Text ")).toBe("kurzer Text")
  })

  it("kürzt lange Texte an einer Wortgrenze", () => {
    const snippet = snippetOf("wort ".repeat(100))
    expect(snippet.endsWith("wort…")).toBe(true)
    expect(snippet.length).toBeLessThanOrEqual(241)
  })

  it("kürzt hart, wenn es keine Wortgrenze gibt", () => {
    expect(snippetOf("x".repeat(300))).toBe(`${"x".repeat(240)}…`)
  })
})
