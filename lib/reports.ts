// Bericht-Typen für die Studio-Funktion „Berichte". Jeder Typ ist im Kern ein
// fester Prompt, der über alle (ausgewählten) Quellen des Notebooks läuft.

export type ReportType = {
  id: string
  label: string
  // Kurzbezeichnung für die Meta-Zeile im Studio.
  metaLabel: string
  icon: string
  // Kurzbeschreibung für die Karte im Bericht-Popup.
  description: string
  // Beschreibt dem Modell, welche Art von Dokument es erzeugen soll.
  instruction: string
}

export const REPORT_TYPES: ReportType[] = [
  {
    id: "briefing",
    label: "Überblick",
    metaLabel: "Überblick",
    icon: "description",
    description: "Übersicht über Ihre Quellen mit wichtigen Informationen und Zitaten",
    instruction:
      "Erstelle einen prägnanten Überblick über die Quellen. Beginne mit einer kurzen Zusammenfassung (2–3 Sätze), gefolgt von den wichtigsten Themen als Abschnitte mit Überschriften und den zentralen Erkenntnissen je Thema als Stichpunkte. Schließe mit den wichtigsten Schlussfolgerungen ab."
  },
  {
    id: "study-guide",
    label: "Lernplan",
    metaLabel: "Lernplan",
    icon: "school",
    description: "Quiz mit kurzen Antworten, vorgeschlagene Essay-Fragestellungen und Glossar",
    instruction:
      "Erstelle einen Lernplan. Gliedere ihn in: (1) ein Glossar der zentralen Begriffe mit kurzen Definitionen, (2) ein Quiz aus 8–12 Verständnisfragen mit kurzen Musterantworten, (3) einige weiterführende Essay-/Diskussionsfragen ohne Antwort."
  },
  {
    id: "blogpost",
    label: "Blogpost",
    metaLabel: "Blogpost",
    icon: "article",
    description: "Aufschlussreiche Kernpunkte, zusammengefasst in einem leicht verständlichen Artikel",
    instruction:
      "Erstelle einen gut lesbaren Blogartikel zum Thema der Quellen. Beginne mit einer fesselnden Einleitung, gliedere den Hauptteil mit aussagekräftigen Zwischenüberschriften, erkläre Fachbegriffe verständlich und schließe mit einem prägnanten Fazit. Schreibe in einem klaren, ansprechenden, aber sachlich korrekten Ton."
  }
]

export function getReportType(id: string): ReportType | undefined {
  return REPORT_TYPES.find((t) => t.id === id)
}

// System-Prompt für die Bericht-Erstellung. `language` ist der Anzeigename der
// gewählten Sprache (z. B. „Deutsch (Standard)", „English"); ohne Angabe Deutsch.
export function buildReportSystemPrompt(language?: string): string {
  const isGerman = !language || /deutsch|german|standard/i.test(language)
  const langLine = isGerman ? "- Antworte auf Deutsch." : `- Schreibe den gesamten Bericht auf: ${language}.`
  return `Du bist der KI-Assistent eines Notebooks und erstellst strukturierte Berichte ausschließlich auf Basis der bereitgestellten Quellen-Dokumente.
- Stütze dich ausschließlich auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Wenn die Quellen für den gewünschten Bericht zu wenig hergeben, sage das offen.
${langLine}
- Beginne IMMER mit einer einzelnen H1-Überschrift (# ) als Titel des Dokuments im Format "<Bezeichnung des Berichts>: <kurzes, konkretes Thema>". Danach folgt der Inhalt.
- Formatiere die Ausgabe als einfaches Markdown: Überschriften mit #/##/###, Aufzählungen mit "- ", Nummerierungen mit "1.", Hervorhebungen mit **fett**. Verwende keine Tabellen und keinen Code.`
}

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
