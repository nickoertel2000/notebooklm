export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const optionalString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

export const parseSourceIds = (value: unknown): string[] | null => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : null)
