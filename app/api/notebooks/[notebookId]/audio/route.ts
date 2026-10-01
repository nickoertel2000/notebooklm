import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/db"
import { audioOverviews } from "@/db/schema"
import { AudioLength, getAudioFormat } from "@/lib/audio"
import { startAudio } from "@/lib/jobs/start"
import { createStudioJob } from "@/lib/jobs/studioJob"
import { authorizeNotebook } from "@/lib/auth/authorizeNotebook"
import { lengthError, MAX_LENGTH, optionalString, readJsonBody } from "@/lib/api/body"
import { parseLanguage } from "@/lib/languages"
import { listAudios } from "@/lib/notebookItems"

type RouteContext = { params: Promise<{ notebookId: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  return NextResponse.json({ audios: await listAudios(getDb(), notebookId) })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { notebookId } = await params
  const auth = await authorizeNotebook(notebookId)
  if (auth.error) return auth.error

  const db = getDb()

  const body = await readJsonBody(req)
  const tooLong = lengthError([[body.focus, MAX_LENGTH.focus]])
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 })
  const format = getAudioFormat(String(body.format))
  if (!format) return NextResponse.json({ error: "Unbekanntes Audio-Format" }, { status: 400 })

  const length: AudioLength = body.length === "kurz" ? "kurz" : "standard"
  const language = parseLanguage(body.language)
  const focus = optionalString(body.focus)

  const job = await createStudioJob({
    db,
    userId: auth.user.id,
    notebookId,
    sourceIds: body.sourceIds,
    label: "Audio",
    insert: async (sourceCount) => {
      const [row] = await db
        .insert(audioOverviews)
        .values({ notebookId, format: format.id, title: format.label, length, language, focus, sourceCount, status: "processing" })
        .returning({
          id: audioOverviews.id,
          format: audioOverviews.format,
          title: audioOverviews.title,
          durationSeconds: audioOverviews.durationSeconds,
          sourceCount: audioOverviews.sourceCount,
          status: audioOverviews.status,
          createdAt: audioOverviews.createdAt
        })
      return row
    },
    start: (row, sourceIds) => startAudio({ audioId: row.id, notebookId, formatId: format.id, length, language, focus, sourceIds }),
    markFailed: (row, error) => db.update(audioOverviews).set({ status: "failed", error }).where(eq(audioOverviews.id, row.id))
  })
  if ("error" in job) return job.error

  return NextResponse.json({ audio: { ...job.row, createdAt: job.row.createdAt.toISOString() } }, { status: 202 })
}
