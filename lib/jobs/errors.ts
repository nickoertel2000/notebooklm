// PostgreSQL erlaubt keine NUL-Bytes (0x00) in text-Spalten, PDFs enthalten sie aber
// häufig. Vor jedem DB-Write entfernen, sonst Fehler 22021 und die Zeile bleibt hängen.
const NUL = String.fromCharCode(0)

export const stripNul = (s: string) => s.split(NUL).join("")

export function toErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return stripNul(message).slice(0, 500)
}

// Nach einem fehlgeschlagenen Step kommt der Fehler nicht zwingend als dieselbe Klasse zurück,
// deshalb zählt der Text. Alles andere (Postgres, Gemini, unpdf) bleibt im Log und erreicht nie die UI.
export const USER_ERRORS = {
  sourceDeleted: "Quelle wurde gelöscht",
  fileMissing: "Hochgeladene Datei nicht gefunden",
  noText: "Kein Text in der Quelle gefunden"
} as const

const KNOWN_USER_ERRORS = new Set<string>(Object.values(USER_ERRORS))
const QUOTA_ERROR = /\b429\b|RESOURCE_EXHAUSTED/

export function toUserErrorMessage(err: unknown): string {
  const message = toErrorMessage(err)
  if (KNOWN_USER_ERRORS.has(message)) return message
  if (QUOTA_ERROR.test(message)) return "Das Kontingent der KI ist gerade ausgeschöpft. Bitte versuche es später erneut."
  return "Die Verarbeitung ist fehlgeschlagen. Bitte versuche es erneut."
}
