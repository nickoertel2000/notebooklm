import { env } from "cloudflare:workers"
import { getGemini } from "./gemini"

// Muss zur pgvector-Spalte source_chunks.embedding (vector(1024)) passen.
const DIMENSIONS = 1024

// Gemini Embedding 2 kennt kein taskType, der Zweck steht als Präfix im Text.
const PREFIX = {
  document: "title: none | text: ",
  query: "task: search result | query: "
} as const

export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (texts.length === 0) return []

  // Ein Array aus Strings würde zu einem einzigen, zusammengefassten Vektor.
  // Nur als eigene Content-Objekte bekommt jeder Text seinen Vektor.
  const response = await getGemini().models.embedContent({
    model: env.GEMINI_EMBEDDING_MODEL,
    contents: texts.map((text) => ({ parts: [{ text: PREFIX[inputType] + text }] })),
    config: { outputDimensionality: DIMENSIONS }
  })

  const vectors = (response.embeddings ?? []).map((e) => e.values ?? [])
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== DIMENSIONS)) {
    throw new Error(`Gemini Embedding lieferte ${vectors.length} Vektoren für ${texts.length} Texte`)
  }
  return vectors
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "query")
  return vector
}
