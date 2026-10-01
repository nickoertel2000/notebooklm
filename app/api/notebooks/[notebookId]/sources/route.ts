import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { sources } from "@/db/schema"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { lengthError, MAX_LENGTH, optionalString, readJsonBody } from "@/lib/api/body"
import { ExtractError, extractFromUrl } from "@/lib/extract"
import { startIngestSource } from "@/lib/jobs/start"
import { listSources } from "@/lib/notebookItems"
import { consumeQuota } from "@/lib/quota"
import { putObject, sourceKey } from "@/lib/storage"

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  return NextResponse.json({ sources: await listSources(getDb(), notebookId) })
}

// PDF: nur die Zeile anlegen, den Import startet erst der Upload per PUT auf sources/[sourceId]/file.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const body = await readJsonBody(req)
  const type = body.type
  if (type !== "pdf" && type !== "url" && type !== "text") return NextResponse.json({ error: "Unbekannter Quelltyp" }, { status: 400 })

  const tooLong = lengthError([
    [body.filename, MAX_LENGTH.title],
    [body.title, MAX_LENGTH.title],
    [body.url, MAX_LENGTH.url],
    [body.text, MAX_LENGTH.text]
  ])
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 })

  const url = type === "url" ? optionalString(body.url) : null
  const text = type === "text" ? optionalString(body.text) : null
  if (type === "url" && !url) return NextResponse.json({ error: "URL fehlt" }, { status: 400 })
  if (type === "text" && !text) return NextResponse.json({ error: "Text fehlt" }, { status: 400 })

  const quotaError = await consumeQuota(auth.user.id, "source")
  if (quotaError) return NextResponse.json({ error: quotaError }, { status: 429 })

  const db = getDb()

  if (type === "pdf") {
    const title = optionalString(body.filename) ?? "dokument.pdf"
    const [row] = await db.insert(sources).values({ notebookId, type: "pdf", title, status: "processing" }).returning({ id: sources.id })
    return NextResponse.json({ sourceId: row.id })
  }

  let title: string
  let content: string
  let sourceUrl: string | null = null

  if (url) {
    try {
      const extracted = await extractFromUrl(url)
      title = extracted.title.slice(0, MAX_LENGTH.title)
      content = extracted.text
      sourceUrl = extracted.url
    } catch (err) {
      if (err instanceof ExtractError) return NextResponse.json({ error: err.message }, { status: 422 })
      console.error("URL-Import fehlgeschlagen:", err)
      return NextResponse.json({ error: "Die Seite konnte nicht gelesen werden" }, { status: 422 })
    }
  } else {
    content = text!
    title = optionalString(body.title) ?? (content.split("\n")[0].slice(0, 80) || "Eingefügter Text")
  }

  const [row] = await db.insert(sources).values({ notebookId, type, title, sourceUrl, status: "processing" }).returning({ id: sources.id })

  const key = sourceKey(notebookId, row.id, "content.txt")
  try {
    await putObject(key, content, "text/plain; charset=utf-8")
    await db.update(sources).set({ storageKey: key }).where(eq(sources.id, row.id))
    await startIngestSource({ sourceId: row.id, notebookId, key, isPdf: false })
  } catch (err) {
    console.error("Import konnte nicht gestartet werden:", err)
    await db.update(sources).set({ status: "failed", error: "Import konnte nicht gestartet werden", updatedAt: new Date() }).where(eq(sources.id, row.id))
  }

  return NextResponse.json({ sourceId: row.id })
}
