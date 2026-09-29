// Request-Bodys sind Nutzereingaben: als Objekt mit unknown-Werten lesen, jedes
// Feld wird im Handler einzeln geprüft. Ungültiges JSON ergibt ein leeres Objekt.
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const optionalString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

// Optionale Quellen-Auswahl: null bzw. leer bedeutet „alle fertigen Quellen".
export const parseSourceIds = (value: unknown): string[] | null => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : null)
