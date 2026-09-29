// Client-Helfer für die eigenen API-Routen. res.json() ist bewusst unknown
// (Workers-Typen), der erwartete Antworttyp wird hier explizit angegeben.
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

// Fehlertext aus einer { error }-Antwort oder der Fallback.
export async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}
