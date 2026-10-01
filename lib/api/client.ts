// res.json() liefert mit den Workers-Typen unknown, daher der explizite Antworttyp.
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

export async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

// fetch wirft bei Netzwerkfehlern einen TypeError mit englischem Browsertext, der nicht in die UI gehört.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && !(err instanceof TypeError) && err.message ? err.message : fallback
}
