export type AudioLength = "kurz" | "standard"

export type AudioFormat = {
  id: string
  label: string
  description: string
  icon: string
  speakers: 1 | 2
  instruction: string
}

export const AUDIO_FORMATS: AudioFormat[] = [
  {
    id: "deep-dive",
    label: "Detaillierte Analyse",
    description: "Eine lebhafte Unterhaltung zwischen zwei KI-Moderatoren, bei der die Themen in Ihren Quellen analysiert und in Zusammenhang gebracht werden.",
    icon: "graphic_eq",
    speakers: 2,
    instruction:
      "Erzeuge ein lebhaftes, tiefgehendes Gespräch zwischen zwei Moderatoren. Sie analysieren die wichtigsten Themen der Quellen, stellen einander Fragen, bringen Zusammenhänge auf den Punkt und erklären Fachbegriffe verständlich."
  },
  {
    id: "brief",
    label: "Zusammenfassung",
    description: "Eine kurze Übersicht, mit der Sie die wichtigsten Informationen aus Ihren Quellen schnell erfassen können.",
    icon: "summarize",
    speakers: 1,
    instruction:
      "Erzeuge eine kompakte, gut hörbare Zusammenfassung der wichtigsten Informationen aus den Quellen. Eine erzählende Stimme bringt die Kernpunkte klar und in sinnvoller Reihenfolge auf den Punkt."
  },
  {
    id: "critique",
    label: "Kritische Bewertung",
    description: "Eine sachkundige Bewertung Ihrer Quellen mit konstruktivem Feedback, anhand dessen Sie Ihre Quellen verbessern können.",
    icon: "rate_review",
    speakers: 1,
    instruction:
      "Erzeuge eine sachkundige, kritische Bewertung der Quellen. Eine erzählende Stimme benennt Stärken und Schwächen, weist auf Lücken oder Widersprüche hin und gibt konstruktives, umsetzbares Feedback."
  },
  {
    id: "debate",
    label: "Diskussion",
    description: "Eine aufschlussreiche Diskussion zwischen zwei KI-Moderatoren, die Ihre Quellen aus verschiedenen Perspektiven beleuchtet.",
    icon: "forum",
    speakers: 2,
    instruction:
      "Erzeuge eine aufschlussreiche Diskussion zwischen zwei Moderatoren, die unterschiedliche Standpunkte einnehmen. Sie beleuchten die Quellen aus verschiedenen Perspektiven, wägen Argumente ab und bleiben dabei fair und sachlich."
  }
]

export function getAudioFormat(id: string): AudioFormat | undefined {
  return AUDIO_FORMATS.find((f) => f.id === id)
}

export const SPEAKER_LABELS = ["Sprecher 1", "Sprecher 2"] as const

export type DialogTurn = { speaker: (typeof SPEAKER_LABELS)[number]; text: string }

export function splitDialog(script: string): DialogTurn[] {
  const turns: DialogTurn[] = []
  for (const raw of script.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const speaker = SPEAKER_LABELS.find((label) => line.startsWith(`${label}:`))
    if (speaker) {
      turns.push({ speaker, text: line.slice(speaker.length + 1).trim() })
    } else if (turns.length) {
      const last = turns[turns.length - 1]
      last.text = last.text ? `${last.text} ${line}` : line
    } else {
      turns.push({ speaker: SPEAKER_LABELS[0], text: line })
    }
  }
  return turns.filter((turn) => turn.text)
}

// Das Skript muss in einen einzelnen TTS-Call passen.
const LENGTH_HINT: Record<AudioLength, string> = {
  kurz: "Halte es kurz: ca. 150–250 Wörter (etwa 1–2 Minuten gesprochen).",
  standard: "Mittlere Länge: ca. 450–700 Wörter (etwa 3–5 Minuten gesprochen)."
}

export function buildScriptSystemPrompt(format: AudioFormat, length: AudioLength, language: string): string {
  const speakerRules =
    format.speakers === 2
      ? `- Schreibe einen Dialog. Jede Wortmeldung beginnt in einer eigenen Zeile mit „${SPEAKER_LABELS[0]}:" bzw. „${SPEAKER_LABELS[1]}:".
- Die beiden wechseln sich natürlich ab; ${SPEAKER_LABELS[0]} beginnt.
- Keine Regieanweisungen, keine Klammerzusätze, keine Beschreibungen von Geräuschen.`
      : `- Schreibe einen durchgehenden, erzählenden Fließtext für eine einzelne Stimme.
- Keine Sprecher-Labels, keine Dialogform.`

  return `Du erstellst das Skript für eine vertonte Audio-Übersicht eines Notebooks, ausschließlich auf Basis der bereitgestellten Quellen.
- Stütze dich ausschließlich auf die Quellen, erfinde nichts und füge kein Allgemeinwissen hinzu.
- Wenn die Quellen zu wenig hergeben, sage das offen im Skript.
- Schreibe das gesamte Skript (inkl. Titel) in folgender Sprache: ${language}. Verwende natürliche, gesprochene Sprache.
- Die Sprecher-Labels „${SPEAKER_LABELS[0]}:"/„${SPEAKER_LABELS[1]}:" bleiben unabhängig von der Sprache exakt so stehen.
- Die ALLERERSTE Zeile lautet exakt „TITEL: <kurzer, konkreter Titel>" – dieser Titel wird NICHT vorgelesen.
- Danach folgt das eigentliche Skript.
- Verwende KEIN Markdown: keine Überschriften, keine Aufzählungszeichen, keine Sternchen, keine Doppelpunkte für Gliederung. Nur natürlicher Sprechtext.
${speakerRules}
- ${LENGTH_HINT[length]}`
}

export function parseScript(raw: string, fallbackTitle: string): { title: string; script: string } {
  const lines = raw.split("\n")
  let title = fallbackTitle
  let startIdx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const m = /^TITEL:\s*(.+)$/i.exec(line)
    if (m) {
      title = m[1].trim().slice(0, 120)
      startIdx = i + 1
    }
    break
  }
  const script = lines.slice(startIdx).join("\n").trim()
  return { title, script }
}
