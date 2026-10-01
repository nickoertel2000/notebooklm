// res.json() liefert mit den Workers-Typen unknown, daher der explizite Antworttyp.
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

// Für Meldungen, die in die UI dürfen: vom Server (readError) oder selbst formuliert.
export class UserError extends Error {}

// Alles andere (TypeError bei Netzfehlern, SyntaxError bei kaputtem JSON) trägt englischen Browsertext.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof UserError && err.message ? err.message : fallback
}
