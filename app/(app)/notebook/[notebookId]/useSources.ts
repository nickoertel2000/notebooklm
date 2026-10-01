import { useCallback, useEffect, useMemo, useState } from "react"
import type { AddSourcePayload } from "@/components/popup/AddSourceModal"
import { errorMessage, readError, readJson, UserError } from "@/lib/api/client"
import type { SourceItem } from "@/lib/items"
import { hostOf } from "@/lib/url"

const POLL_MS = 2500

type Options = {
  onError: (message: string) => void
  // Nach jeder neuen Quelle, z. B. für den automatischen Titel.
  onAdded: () => void
}

export function useSources(notebookId: string, initial: SourceItem[], { onError, onAdded }: Options) {
  const base = `/api/notebooks/${notebookId}/sources`
  const [sources, setSources] = useState(initial)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initial.map((s) => s.id)))

  const selectedReadyIds = useMemo(() => sources.filter((s) => s.status === "ready" && selectedIds.has(s.id)).map((s) => s.id), [sources, selectedIds])
  const allSelected = sources.length > 0 && sources.every((s) => selectedIds.has(s.id))

  const refresh = useCallback(async () => {
    const res = await fetch(base).catch(() => null)
    if (res?.ok) setSources((await readJson<{ sources: SourceItem[] }>(res)).sources)
  }, [base])

  const polling = sources.some((s) => s.status === "processing")
  useEffect(() => {
    if (!polling) return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [polling, refresh])

  function select(ids: string[]) {
    setSelectedIds((prev) => new Set([...prev, ...ids]))
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(sources.map((s) => s.id)))
  }

  async function post(body: object, failure: string): Promise<string> {
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (!res.ok) throw new UserError(await readError(res, failure))
    return (await readJson<{ sourceId: string }>(res)).sourceId
  }

  // Wirft UserError, damit der Dialog die Meldung neben dem Formular zeigt.
  async function add(payload: AddSourcePayload) {
    let sourceId: string
    if (payload.type === "pdf") {
      sourceId = await post({ type: "pdf", filename: payload.file.name }, "Anlegen fehlgeschlagen")
      const put = await fetch(`${base}/${sourceId}/file`, { method: "PUT", body: payload.file, headers: { "Content-Type": "application/pdf" } })
      if (!put.ok) throw new UserError(await readError(put, "Upload fehlgeschlagen"))
    } else if (payload.type === "url") {
      sourceId = await post({ type: "url", url: payload.url }, "URL fehlgeschlagen")
    } else {
      sourceId = await post({ type: "text", title: payload.title, text: payload.text }, "Text fehlgeschlagen")
    }
    select([sourceId])
    await refresh()
    onAdded()
  }

  async function importUrls(urls: string[]) {
    const newIds: string[] = []
    const errors: string[] = []
    for (const url of urls) {
      try {
        newIds.push(await post({ type: "url", url }, "Import fehlgeschlagen"))
      } catch (err) {
        errors.push(`${hostOf(url)}: ${errorMessage(err, "Import fehlgeschlagen")}`)
      }
    }
    if (errors.length > 0) onError(`${errors.length} von ${urls.length} Quellen konnten nicht importiert werden. ${errors[0]}`)
    select(newIds)
    await refresh()
    if (newIds.length > 0) onAdded()
  }

  async function retry(sourceId: string) {
    const failure = "Der Import konnte nicht neu gestartet werden."
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, status: "processing", error: null } : s)))
    try {
      const res = await fetch(`${base}/${sourceId}`, { method: "POST" })
      if (!res.ok) throw new UserError(await readError(res, failure))
    } catch (err) {
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, status: "failed" } : s)))
      onError(errorMessage(err, failure))
      return
    }
    await refresh()
  }

  async function remove(sourceId: string) {
    const failure = "Die Quelle konnte nicht gelöscht werden."
    const res = await fetch(`${base}/${sourceId}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) return onError(res ? await readError(res, failure) : failure)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(sourceId)
      return next
    })
    await refresh()
  }

  return { sources, selectedIds, selectedReadyIds, allSelected, toggle, toggleAll, refresh, add, importUrls, retry, remove }
}
