import { isUuid } from "@/lib/uuid"

export const MAX_LENGTH = {
  message: 4000,
  title: 200,
  instruction: 2000,
  focus: 500,
  language: 40,
  query: 300,
  url: 2048,
  text: 500_000
} as const

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const optionalString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

// null heißt "alle fertigen Quellen", ein leeres Array heißt "keine Quelle ausgewählt".
export const parseSourceIds = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && isUuid(id)) : null

export function lengthError(checks: [value: unknown, max: number][]): string | null {
  for (const [value, max] of checks) {
    if (typeof value === "string" && value.length > max) return `Eingabe zu lang (höchstens ${max.toLocaleString("de-DE")} Zeichen)`
  }
  return null
}
