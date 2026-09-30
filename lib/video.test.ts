import { describe, expect, it } from "vitest"
import { layoutSlide, MAX_SLIDES, parseVideoScript, wrapText, type VideoSegment } from "./video"

const segment = (n: number, extra: Partial<VideoSegment> = {}) => ({
  slideTitle: `Folie ${n}`,
  bullets: ["Punkt A", "Punkt B"],
  narration: `Erzähltext ${n}`,
  imageHint: "abstract shapes",
  ...extra
})

describe("parseVideoScript", () => {
  it("entfernt Code-Fences und Text um das JSON", () => {
    const json = JSON.stringify({ title: "Überblick", segments: [segment(1)] })
    expect(parseVideoScript("```json\n" + json + "\n```").title).toBe("Überblick")
    expect(parseVideoScript(`Hier ist das Skript: ${json} Viel Spaß!`).segments).toHaveLength(1)
  })

  it("wirft bei ungültigem JSON oder ohne Segmente", () => {
    expect(() => parseVideoScript("kein JSON")).toThrow("kein gültiges JSON")
    expect(() => parseVideoScript(JSON.stringify({ title: "X", segments: [] }))).toThrow("keine Segmente")
  })

  it("verwirft Segmente ohne Narration und wirft, wenn keines übrig bleibt", () => {
    const script = parseVideoScript(JSON.stringify({ title: "X", segments: [segment(1, { narration: "  " }), segment(2)] }))
    expect(script.segments.map((s) => s.slideTitle)).toEqual(["Folie 2"])
    expect(() => parseVideoScript(JSON.stringify({ title: "X", segments: [segment(1, { narration: "" })] }))).toThrow("keine vertonbaren")
  })

  it("begrenzt Folien und Stichpunkte und entfernt leere Stichpunkte", () => {
    const segments = Array.from({ length: MAX_SLIDES + 2 }, (_, i) => segment(i, { bullets: ["1", " ", "2", "3", "4", "5"] }))
    const script = parseVideoScript(JSON.stringify({ title: "X", segments }))
    expect(script.segments).toHaveLength(MAX_SLIDES)
    expect(script.segments[0].bullets).toEqual(["1", "2", "3", "4"])
  })

  it("setzt einen Standardtitel, wenn keiner geliefert wird", () => {
    expect(parseVideoScript(JSON.stringify({ segments: [segment(1)] })).title).toBe("Video-Übersicht")
  })
})

describe("wrapText", () => {
  it("bricht an Wortgrenzen um", () => {
    expect(wrapText("eins zwei drei vier", 9)).toEqual(["eins zwei", "drei vier"])
  })

  it("lässt ein zu langes Wort als eigene Zeile stehen", () => {
    expect(wrapText("Donaudampfschifffahrt ist lang", 10)).toEqual(["Donaudampfschifffahrt", "ist lang"])
  })
})

describe("layoutSlide", () => {
  it("setzt Stichpunkte mit Aufzählungszeichen und nummeriert die Folie", () => {
    expect(layoutSlide(segment(1), 1, 4)).toEqual({
      title: "Folie 1",
      body: "•  Punkt A\n•  Punkt B",
      footer: "2 / 4",
      titleLines: 1
    })
  })

  it("begrenzt Titel und Stichpunkte auf zwei Zeilen", () => {
    const long = "wort ".repeat(30).trim()
    const layout = layoutSlide(segment(1, { slideTitle: long, bullets: [long] }), 0, 1)

    expect(layout.titleLines).toBe(2)
    const bodyLines = layout.body.split("\n")
    expect(bodyLines).toHaveLength(2)
    expect(bodyLines[1].startsWith("     ")).toBe(true)
  })
})
