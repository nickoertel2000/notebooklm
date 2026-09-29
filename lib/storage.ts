import { env } from "cloudflare:workers"

// Alles eines Notebooks liegt unter notebooks/{notebookId}/ – deleteNotebook entfernt genau diesen Prefix.
export const notebookPrefix = (notebookId: string) => `notebooks/${notebookId}/`
export const sourcePrefix = (notebookId: string, sourceId: string) => `notebooks/${notebookId}/sources/${sourceId}/`
export const sourceKey = (notebookId: string, sourceId: string, filename: string) => `${sourcePrefix(notebookId, sourceId)}${filename}`
export const audioKey = (notebookId: string, audioId: string) => `notebooks/${notebookId}/audio/${audioId}.wav`
export const videoKey = (notebookId: string, videoId: string) => `notebooks/${notebookId}/video/${videoId}.mp4`
export const videoPartsPrefix = (notebookId: string, videoId: string) => `notebooks/${notebookId}/video/${videoId}/parts/`

export async function putObject(key: string, body: ReadableStream | ArrayBuffer | ArrayBufferView | string, contentType: string) {
  await env.BUCKET.put(key, body, { httpMetadata: { contentType } })
}

export function getObject(key: string) {
  return env.BUCKET.get(key)
}

// Kopien der Demo-Vorlage verweisen auf Dateien der Vorlage. Gelöscht wird deshalb
// nur, was unter dem eigenen Notebook liegt.
export async function deleteNotebookObject(notebookId: string, key: string) {
  if (key.startsWith(notebookPrefix(notebookId))) await env.BUCKET.delete(key)
}

export async function deleteByPrefix(prefix: string) {
  let cursor: string | undefined
  do {
    const page = await env.BUCKET.list({ prefix, cursor })
    if (page.objects.length > 0) await env.BUCKET.delete(page.objects.map((o) => o.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}

// Liefert ein Objekt als Response aus – mit Range-Support (206), damit Audio- und
// Video-Player spulen können, und ETag-Validierung über If-None-Match (304).
export async function serveObject(request: Request, key: string, filename: string): Promise<Response> {
  const object = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers })
  if (!object) return new Response("Datei nicht gefunden", { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("accept-ranges", "bytes")
  headers.set("cache-control", "private, no-store")
  headers.set("content-disposition", `inline; filename="${filename}"`)

  if (!("body" in object)) return new Response(null, { status: 304, headers })

  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined
  if (range && request.headers.has("range")) {
    const offset = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0)
    const length = range.suffix ?? range.length ?? object.size - offset
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`)
    headers.set("content-length", String(length))
    return new Response(object.body, { status: 206, headers })
  }

  headers.set("content-length", String(object.size))
  return new Response(object.body, { headers })
}
