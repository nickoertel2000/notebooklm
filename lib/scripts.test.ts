import { describe, expect, it } from "vitest"
import { parseScript, splitDialog } from "./audio"
import { deriveReportTitle } from "./reports"

describe("parseScript", () => {
  it("trennt die TITEL-Zeile vom Sprechtext", () => {
    expect(parseScript("\n\nTITEL: Mein Podcast\nSprecher 1: Hallo", "Ersatz")).toEqual({
      title: "Mein Podcast",
      script: "Sprecher 1: Hallo"
    })
  })

  it("erkennt die TITEL-Zeile unabhängig von der Schreibweise", () => {
    expect(parseScript("titel: klein\nText", "Ersatz").title).toBe("klein")
  })

  it("nimmt ohne TITEL-Zeile den Ersatztitel und den ganzen Text", () => {
    expect(parseScript("  Direkt los.\nZweite Zeile ", "Ersatz")).toEqual({ title: "Ersatz", script: "Direkt los.\nZweite Zeile" })
  })

  it("kürzt überlange Titel auf 120 Zeichen", () => {
    expect(parseScript(`TITEL: ${"x".repeat(200)}\nText`, "Ersatz").title).toHaveLength(120)
  })
})

describe("splitDialog", () => {
  it("zerlegt das Skript in Redebeiträge je Sprecher", () => {
    expect(splitDialog("Sprecher 1: Hallo.\n\nSprecher 2:Hi!\nSprecher 1:   Los geht's.")).toEqual([
      { speaker: "Sprecher 1", text: "Hallo." },
      { speaker: "Sprecher 2", text: "Hi!" },
      { speaker: "Sprecher 1", text: "Los geht's." }
    ])
  })

  it("hängt Zeilen ohne Label an den vorigen Beitrag an", () => {
    expect(splitDialog("Sprecher 2: Erster Satz.\nZweiter Satz.")).toEqual([{ speaker: "Sprecher 2", text: "Erster Satz. Zweiter Satz." }])
  })

  it("gibt Text vor dem ersten Label dem ersten Sprecher", () => {
    expect(splitDialog("Einleitung.\nSprecher 2: Antwort.")).toEqual([
      { speaker: "Sprecher 1", text: "Einleitung." },
      { speaker: "Sprecher 2", text: "Antwort." }
    ])
  })

  it("verwirft leere Beiträge", () => {
    expect(splitDialog("Sprecher 1:\nSprecher 2: Nur ich.")).toEqual([{ speaker: "Sprecher 2", text: "Nur ich." }])
  })
})

describe("deriveReportTitle", () => {
  it("nimmt die erste Überschrift ohne Markdown", () => {
    expect(deriveReportTitle("\n# Briefing: KI\n\nText", "Ersatz")).toBe("Briefing: KI")
    expect(deriveReportTitle("## **Fett**", "Ersatz")).toBe("Fett")
  })

  it("nimmt ohne Überschrift die erste Textzeile", () => {
    expect(deriveReportTitle("Einfach Text\nMehr", "Ersatz")).toBe("Einfach Text")
  })

  it("nimmt bei leerem Bericht den Ersatztitel", () => {
    expect(deriveReportTitle("\n  \n", "Ersatz")).toBe("Ersatz")
  })
})
