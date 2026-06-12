import { asc, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sources } from "@/db/schema"
import { getSessionUser } from "@/lib/auth/session"
import { extractFromUrl } from "@/lib/extract"
import { getNotebookForUser } from "@/lib/notebooks"
import { presignUpload, putText, sourceKey } from "@/lib/s3"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ notebookId: string }> }

async function authorize(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) }
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) }
  return { user, notebook }
}

// Quellen eines Notebooks auflisten (für Status-Polling).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const rows = await db
    .select({
      id: sources.id,
      type: sources.type,
      title: sources.title,
      status: sources.status,
      error: sources.error,
      sourceUrl: sources.sourceUrl,
      createdAt: sources.createdAt
    })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
    .orderBy(asc(sources.createdAt))

  return NextResponse.json({ sources: rows })
}

// Neue Quelle anlegen. PDF → presigned Upload-URL; URL/Text → serverseitig nach
// S3 schreiben. In allen Fällen triggert der S3-Upload die ingest-Lambda.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorize(notebookId)
  if (auth.error) return auth.error

  const body = await req.json()

  if (body.type === "pdf") {
    const filename: string = body.filename || "dokument.pdf"
    const [row] = await db
      .insert(sources)
      .values({ notebookId, type: "pdf", title: filename, status: "processing" })
      .returning({ id: sources.id })

    const key = sourceKey(notebookId, row.id, filename)
    await db.update(sources).set({ s3Key: key }).where(eq(sources.id, row.id))
    const uploadUrl = await presignUpload(key, body.contentType || "application/pdf")

    return NextResponse.json({ sourceId: row.id, uploadUrl })
  }

  if (body.type === "url") {
    const url: string = body.url
    if (!url) return NextResponse.json({ error: "URL fehlt" }, { status: 400 })

    let extracted: { title: string; text: string }
    try {
      extracted = await extractFromUrl(url)
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 422 })
    }

    const [row] = await db
      .insert(sources)
      .values({ notebookId, type: "url", title: extracted.title, sourceUrl: url, status: "processing" })
      .returning({ id: sources.id })

    const key = sourceKey(notebookId, row.id, "content.txt")
    await db.update(sources).set({ s3Key: key }).where(eq(sources.id, row.id))
    await putText(key, extracted.text)

    return NextResponse.json({ sourceId: row.id })
  }

  if (body.type === "text") {
    const text: string = body.text
    if (!text?.trim()) return NextResponse.json({ error: "Text fehlt" }, { status: 400 })
    const title: string = body.title?.trim() || text.trim().split("\n")[0].slice(0, 80) || "Eingefügter Text"

    const [row] = await db
      .insert(sources)
      .values({ notebookId, type: "text", title, status: "processing" })
      .returning({ id: sources.id })

    const key = sourceKey(notebookId, row.id, "content.txt")
    await db.update(sources).set({ s3Key: key }).where(eq(sources.id, row.id))
    await putText(key, text)

    return NextResponse.json({ sourceId: row.id })
  }

  return NextResponse.json({ error: "Unbekannter Quelltyp" }, { status: 400 })
}
