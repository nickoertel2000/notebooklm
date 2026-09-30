import { describe, expect, it } from "vitest"
import { parseScript } from "./audio"
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
