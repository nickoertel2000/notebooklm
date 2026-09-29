import { createReadStream } from "node:fs"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { composeVideo, type RenderManifest } from "./compose.ts"

// Die Endung landet im Dateinamen, deshalb nur bekannte Werte zulassen.
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "webp"])

async function handleRender(req: IncomingMessage, res: ServerResponse) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "render-"))
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {})

  try {
    const form = await new Request("http://renderer/render", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] ?? "" },
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      duplex: "half"
    } as RequestInit).formData()

    const manifest = JSON.parse(String(form.get("manifest"))) as RenderManifest
    for (const [i, slide] of manifest.slides.entries()) {
      const audio = form.get(`audio-${i}`)
      if (!(audio instanceof File)) throw new Error(`Audio für Folie ${i + 1} fehlt`)
      await writeFile(path.join(dir, `slide${i}.wav`), Buffer.from(await audio.arrayBuffer()))

      const background = form.get(`background-${i}`)
      if (slide.background) {
        if (!IMAGE_EXTENSIONS.has(slide.background)) throw new Error(`Unbekanntes Bildformat für Folie ${i + 1}`)
        if (!(background instanceof File)) throw new Error(`Hintergrund für Folie ${i + 1} fehlt`)
        await writeFile(path.join(dir, `slide${i}.${slide.background}`), Buffer.from(await background.arrayBuffer()))
      }
    }

    const mp4 = await composeVideo(dir, manifest)
    const { size } = await stat(mp4)
    res.writeHead(200, { "content-type": "video/mp4", "content-length": size })
    createReadStream(mp4).pipe(res).on("close", cleanup)
  } catch (err) {
    await cleanup()
    const message = err instanceof Error ? err.message : String(err)
    console.error("Rendern fehlgeschlagen:", message)
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    res.end(message)
  }
}

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/render") {
    void handleRender(req, res)
    return
  }
  res.writeHead(404).end()
}).listen(Number(process.env.PORT ?? 8080))
