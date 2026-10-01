import { useCallback, useEffect, useState } from "react"
import { errorMessage, readError, readJson, UserError } from "@/lib/api/client"
import type { JobStatus } from "@/lib/items"
import { replacePlaceholder } from "@/lib/placeholders"

type JobItem = { id: string; status: JobStatus; createdAt: string }

type Options<T> = {
  // Listen-Endpoint, z. B. /api/notebooks/{id}/audio. POST legt an, {url}/{id} löscht.
  url: string
  // Schlüssel der Antworten: Liste ({ audios }) und neuer Eintrag ({ audio }).
  listKey: string
  itemKey: string
  pollMs: number
  initial: T[]
  onError: (message: string) => void
}

const PLACEHOLDER_PREFIX = "temp-"
export const isPlaceholder = (id: string) => id.startsWith(PLACEHOLDER_PREFIX)

// Berichte, Audio- und Video-Übersichten: anlegen mit Platzhalter, pollen solange etwas läuft, löschen.
export function useStudioJobs<T extends JobItem>({ url, listKey, itemKey, pollMs, initial, onError }: Options<T>) {
  const [items, setItems] = useState<T[]>(initial)

  const refresh = useCallback(async () => {
    const res = await fetch(url).catch(() => null)
    if (!res?.ok) return
    const data = await readJson<Record<string, T[]>>(res)
    // Platzhalter gehören zu noch laufenden Anfragen und fehlen im Server-Stand.
    setItems((prev) => [...prev.filter((item) => isPlaceholder(item.id)), ...data[listKey]])
  }, [url, listKey])

  const polling = items.some((item) => item.status === "processing" && !isPlaceholder(item.id))
  useEffect(() => {
    if (!polling) return
    const id = setInterval(refresh, pollMs)
    return () => clearInterval(id)
  }, [polling, refresh, pollMs])

  async function create(placeholder: Omit<T, keyof JobItem>, body: object, failure: string) {
    const tempId = `${PLACEHOLDER_PREFIX}${crypto.randomUUID()}`
    setItems((prev) => [{ ...placeholder, id: tempId, status: "processing", createdAt: new Date().toISOString() } as T, ...prev])
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new UserError(await readError(res, failure))
      const created = (await readJson<Record<string, T>>(res))[itemKey]
      setItems((prev) => replacePlaceholder(prev, tempId, created))
    } catch (err) {
      setItems((prev) => prev.filter((item) => item.id !== tempId))
      onError(errorMessage(err, failure))
      // Scheitert erst der Start des Workflows, steht die Zeile schon als failed in der DB.
      await refresh()
    }
  }

  async function remove(id: string, failure: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (isPlaceholder(id)) return
    const res = await fetch(`${url}/${id}`, { method: "DELETE" }).catch(() => null)
    if (res?.ok) return
    onError(res ? await readError(res, failure) : failure)
    await refresh()
  }

  return { items, create, remove }
}
