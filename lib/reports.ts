// Bericht-Typen für die Studio-Funktion „Berichte". Jeder Typ ist im Kern ein
// fester Prompt, der über alle (ausgewählten) Quellen des Notebooks läuft.

export type ReportType = {
  id: string
  label: string
  // Kurzbezeichnung für die Meta-Zeile im Studio (z. B. "Briefing Doc").
  metaLabel: string
  icon: string
  // Beschreibt dem Modell, welche Art von Dokument es erzeugen soll.
  instruction: string
}

export const REPORT_TYPES: ReportType[] = [
  {
    id: "briefing",
    label: "Briefing-Dokument",
    metaLabel: "Briefing Doc",
    icon: "description",
    instruction:
      "Erstelle ein prägnantes Briefing-Dokument. Beginne mit einer kurzen Zusammenfassung (2–3 Sätze), gefolgt von den wichtigsten Themen als Abschnitte mit Überschriften und den zentralen Erkenntnissen je Thema als Stichpunkte. Schließe mit den wichtigsten Schlussfolgerungen ab."
  },
  {
    id: "study-guide",
    label: "Studienleitfaden",
    metaLabel: "Study Guide",
    icon: "school",
    instruction:
      "Erstelle einen Studienleitfaden. Gliedere ihn in: (1) eine Liste der zentralen Begriffe mit kurzen Definitionen, (2) 8–12 Verständnisfragen mit kurzen Musterantworten, (3) einige weiterführende Diskussionsfragen ohne Antwort."
  },
  {
    id: "faq",
    label: "FAQ",
    metaLabel: "FAQ",
    icon: "quiz",
    instruction:
      "Erstelle eine FAQ. Formuliere die 8–12 wichtigsten Fragen, die sich aus den Quellen beantworten lassen, und beantworte jede knapp und konkret. Nutze pro Eintrag eine fettgedruckte Frage gefolgt von der Antwort."
  },
  {
    id: "timeline",
    label: "Zeitleiste",
    metaLabel: "Zeitleiste",
    icon: "timeline",
    instruction:
      "Erstelle eine chronologische Zeitleiste der in den Quellen genannten Ereignisse. Liste sie geordnet als Stichpunkte mit Datum/Zeitangabe und kurzer Beschreibung. Falls keine zeitlichen Angaben vorkommen, sage das offen."
  }
]

export function getReportType(id: string): ReportType | undefined {
  return REPORT_TYPES.find((t) => t.id === id)
}

export const REPORT_SYSTEM_PROMPT = `Du bist der KI-Assistent eines Notebooks und erstellst strukturierte Berichte ausschließlich auf Basis der bereitgestellten Quellen-Dokumente.
- Stütze dich ausschließlich auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Wenn die Quellen für den gewünschten Bericht zu wenig hergeben, sage das offen.
- Antworte auf Deutsch.
- Beginne IMMER mit einer einzelnen H1-Überschrift (# ) als Titel des Dokuments im Format "<Bezeichnung des Berichts>: <kurzes, konkretes Thema>" (z. B. "# Briefing-Dokument: …"). Danach folgt der Inhalt.
- Formatiere die Ausgabe als einfaches Markdown: Überschriften mit #/##/###, Aufzählungen mit "- ", Nummerierungen mit "1.", Hervorhebungen mit **fett**. Verwende keine Tabellen und keinen Code.`

// Leitet aus dem erzeugten Markdown einen kurzen Titel ab: erste H1/H2,
// sonst die erste nichtleere Zeile. Fällt auf das Label zurück.
export function deriveReportTitle(markdown: string, fallback: string): string {
  for (const raw of markdown.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const heading = /^#{1,3}\s+(.*)$/.exec(line)
    const text = (heading ? heading[1] : line).replace(/\*\*/g, "").trim()
    if (text) return text.slice(0, 120)
  }
  return fallback
}
