import { describe, expect, it } from "vitest"
import { parseStudioContent } from "./studio"

describe("parseStudioContent", () => {
  it("liefert null bei ungültigem JSON", () => {
    expect(parseStudioContent("flashcards", "kein JSON")).toBeNull()
  })

  it("übernimmt nur vollständige Karteikarten", () => {
    const raw = JSON.stringify({
      title: "  Biologie  ",
      cards: [{ front: "Zelle?", back: "Kleinste Einheit" }, { front: "Ohne Rückseite" }, "kein Objekt"]
    })
    expect(parseStudioContent("flashcards", raw)).toEqual({
      format: "flashcards",
      data: { title: "Biologie", cards: [{ front: "Zelle?", back: "Kleinste Einheit" }] }
    })
  })

  it("liefert null, wenn keine Karte gültig ist", () => {
    expect(parseStudioContent("flashcards", JSON.stringify({ title: "Leer", cards: [{ front: "nur vorne" }] }))).toBeNull()
  })

  it("verwirft Quizfragen ohne vier Optionen oder mit ungültiger Antwort", () => {
    const valid = { question: "2 + 2?", options: ["3", "4", "5", "6"], answer: 1 }
    const raw = JSON.stringify({
      title: "Mathe",
      questions: [valid, { ...valid, options: ["1", "2", "3"] }, { ...valid, answer: 4 }, { ...valid, answer: 1.5 }, { ...valid, options: ["1", "", "3", "4"] }]
    })
    expect(parseStudioContent("quiz", raw)).toEqual({
      format: "quiz",
      data: { title: "Mathe", questions: [{ ...valid, explanation: "" }] }
    })
  })

  it("füllt kurze Tabellenzeilen auf, kürzt lange und verwirft leere", () => {
    const raw = JSON.stringify({
      title: "Vergleich",
      columns: ["A", "B", "C"],
      rows: [["1"], ["1", "2", "3", "4"], ["", "", ""]]
    })
    expect(parseStudioContent("table", raw)).toEqual({
      format: "table",
      data: {
        title: "Vergleich",
        columns: ["A", "B", "C"],
        rows: [
          ["1", "–", "–"],
          ["1", "2", "3"]
        ]
      }
    })
  })

  it("liefert null für eine Tabelle ohne Spalten", () => {
    expect(parseStudioContent("table", JSON.stringify({ title: "X", columns: [], rows: [["1"]] }))).toBeNull()
  })

  it("begrenzt die Mindmap auf vier Ebenen und nimmt den Wurzel-Knoten als Titel-Ersatz", () => {
    const deep = { label: "Ebene 4", children: [{ label: "Ebene 5", children: [] }] }
    const raw = JSON.stringify({
      root: { label: "Thema", children: [{ label: "Ebene 2", children: [{ label: "Ebene 3", children: [deep] }] }] }
    })
    const result = parseStudioContent("mindmap", raw)

    expect(result?.format).toBe("mindmap")
    if (result?.format !== "mindmap") return
    expect(result.data.title).toBe("Thema")
    expect(result.data.root.children[0].children[0].children[0]).toEqual({ label: "Ebene 4", children: [] })
  })

  it("liefert null für eine Mindmap ohne Unterknoten", () => {
    expect(parseStudioContent("mindmap", JSON.stringify({ title: "X", root: { label: "Nur Wurzel", children: [] } }))).toBeNull()
  })
})
