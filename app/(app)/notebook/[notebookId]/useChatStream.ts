import { useRef, useState } from "react"
import { errorMessage, readError, UserError } from "@/lib/api/client"
import { readChatEvents, type ChatStreamEvent } from "@/lib/chatStream"
import type { ChatMessage } from "@/lib/items"

export function useChatStream(notebookId: string, initial: ChatMessage[], onSettled: () => void) {
  const [messages, setMessages] = useState(initial)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function send(text: string, sourceIds: string[]) {
    const question = text.trim()
    if (!question || streaming) return

    const answerId = `streaming-${crypto.randomUUID()}`
    setMessages((prev) => [
      ...prev,
      { id: `user-${crypto.randomUUID()}`, role: "user", content: question, citations: null },
      { id: answerId, role: "assistant", content: "", citations: null }
    ])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    const updateAnswer = (update: (answer: ChatMessage) => ChatMessage) => setMessages((prev) => prev.map((m) => (m.id === answerId ? update(m) : m)))
    const appendNote = (note: string) => updateAnswer((m) => ({ ...m, content: m.content ? `${m.content}\n\n${note}` : note }))
    const apply = (event: ChatStreamEvent) => {
      if (event.type === "text") updateAnswer((m) => ({ ...m, content: m.content + event.text }))
      else if (event.type === "done") updateAnswer((m) => ({ ...m, id: event.messageId, citations: event.citations }))
      else appendNote(`[Fehler: ${event.error}]`)
    }

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, sourceIds }),
        signal: controller.signal
      })
      if (!res.ok) throw new UserError(await readError(res, "Die Frage konnte nicht gesendet werden."))
      if (!res.body) throw new UserError("Die Antwort konnte nicht gelesen werden.")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const { events, rest } = readChatEvents(buffer + decoder.decode(value, { stream: true }))
        buffer = rest
        events.forEach(apply)
      }
    } catch (err) {
      if (controller.signal.aborted) appendNote("[Abgebrochen]")
      else appendNote(`[Fehler: ${errorMessage(err, "Die Antwort ist abgebrochen. Bitte versuche es erneut.")}]`)
    } finally {
      abortRef.current = null
      setStreaming(false)
      onSettled()
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return { messages, streaming, send, stop }
}
