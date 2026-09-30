import type { MessageCitation } from "@/db/schema"

const SNIPPET_LENGTH = 240

const MARKER_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g

export type RetrievedChunk = {
  chunkId: string
  sourceId: string
  content: string
  sourceTitle: string
  page: number | null
  charStart: number | null
  charEnd: number | null
}

// Marker [n] zeigt auf retrieved[n - 1], so wie die Auszüge im Prompt nummeriert sind.
export function extractCitations(text: string, retrieved: RetrievedChunk[]): MessageCitation[] {
  const byMarker = new Map<number, MessageCitation>()

  for (const match of text.matchAll(MARKER_PATTERN)) {
    for (const part of match[1].split(",")) {
      const marker = Number(part.trim())
      const chunk = retrieved[marker - 1]
      if (!chunk || byMarker.has(marker)) continue
      byMarker.set(marker, {
        marker,
        sourceId: chunk.sourceId,
        chunkId: chunk.chunkId,
        snippet: snippetOf(chunk.content),
        page: chunk.page,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd
      })
    }
  }

  return [...byMarker.values()]
}

export function snippetOf(content: string): string {
  const text = content.replace(/\s+/g, " ").trim()
  if (text.length <= SNIPPET_LENGTH) return text
  const cut = text.slice(0, SNIPPET_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")
  return `${lastSpace > SNIPPET_LENGTH / 2 ? cut.slice(0, lastSpace) : cut}…`
}
