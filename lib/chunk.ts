// Zerlegt einen Text in überlappende Chunks an möglichst natürlichen Grenzen
// (Absatz/Satz). charStart/charEnd erlauben später den Sprung zur Zitatstelle.
// Heuristik: ~800 Tokens ≈ 3200 Zeichen, ~100 Tokens Überlappung ≈ 400 Zeichen.

export type Chunk = {
  idx: number
  content: string
  charStart: number
  charEnd: number
  page: number | null
}

type ChunkOptions = {
  maxChars?: number
  overlapChars?: number
}

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 3200
  const overlapChars = options.overlapChars ?? 400
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  const chunks: Chunk[] = []
  let start = 0
  let idx = 0

  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length)

    // An einer Absatz-/Satzgrenze in der hinteren Hälfte des Fensters trennen.
    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const boundary = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "))
      if (boundary > maxChars * 0.5) {
        end = start + boundary + 1
      }
    }

    const content = normalized.slice(start, end).trim()
    if (content.length > 0) {
      chunks.push({ idx: idx++, content, charStart: start, charEnd: end, page: null })
    }

    if (end >= normalized.length) break
    start = Math.max(end - overlapChars, start + 1)
  }

  return chunks
}
