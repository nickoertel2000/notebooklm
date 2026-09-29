// PostgreSQL erlaubt keine NUL-Bytes (0x00) in text-Spalten, PDFs enthalten sie aber
// häufig. Vor jedem DB-Write entfernen, sonst Fehler 22021 und die Zeile bleibt hängen.
const NUL = String.fromCharCode(0)

export const stripNul = (s: string) => s.split(NUL).join("")

// Fehlertext für die error-Spalte: ohne NUL-Bytes, auf 500 Zeichen gekürzt.
export function toErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return stripNul(message).slice(0, 500)
}
