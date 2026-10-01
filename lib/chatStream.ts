import type { Citation } from "./items"

// Format des NDJSON-Streams der Chat-Route, eine Zeile pro Event.
export type ChatStreamEvent = { type: "text"; text: string } | { type: "done"; messageId: string; citations: Citation[] } | { type: "error"; error: string }

// Ein Netzwerk-Chunk kann mitten in einer Zeile enden. Der Rest wartet auf den nächsten Chunk.
export function readChatEvents(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const lines = buffer.split("\n")
  const rest = lines.pop() ?? ""
  const events = lines.map(parseEvent).filter((event) => event !== null)
  return { events, rest }
}

function parseEvent(line: string): ChatStreamEvent | null {
  if (!line.trim()) return null
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!value || typeof value !== "object") return null
  const event = value as Record<string, unknown>
  if (event.type === "text" && typeof event.text === "string") return { type: "text", text: event.text }
  if (event.type === "done" && typeof event.messageId === "string") {
    return { type: "done", messageId: event.messageId, citations: Array.isArray(event.citations) ? (event.citations as Citation[]) : [] }
  }
  if (event.type === "error" && typeof event.error === "string") return { type: "error", error: event.error }
  return null
}
