import { env } from "cloudflare:workers"

// Kleiner REST-Client für Voyage-AI-Embeddings (kein offizielles SDK nötig).
// voyage-3.5 mit 1024 Dimensionen — passend zur pgvector-Spalte.

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
const MODEL = "voyage-3.5"
const DIMENSIONS = 1024

type VoyageResponse = {
  data: { index: number; embedding: number[] }[]
}

export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (texts.length === 0) return []

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.VOYAGE_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: DIMENSIONS
    })
  })

  if (!res.ok) {
    throw new Error(`Voyage API ${res.status}: ${await res.text()}`)
  }

  const json = (await res.json()) as VoyageResponse
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "query")
  return vector
}
