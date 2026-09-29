import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth/session"
import { getNotebookForUser } from "@/lib/notebooks"

// Gemeinsamer Guard für alle notebook-gebundenen API-Routen: Session + Ownership.
// Liefert entweder { user, notebook } oder eine fertige Fehler-Response.
export async function authorizeNotebook(notebookId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) } as const
  const notebook = await getNotebookForUser(notebookId, user.id)
  if (!notebook) return { error: NextResponse.json({ error: "Notebook nicht gefunden" }, { status: 404 }) } as const
  return { user, notebook } as const
}
