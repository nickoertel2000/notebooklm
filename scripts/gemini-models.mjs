// Listet die für GEMINI_API_KEY verfügbaren Flash-, Embedding- und TTS-Modelle.
// Aufruf: node --env-file=.env.local scripts/gemini-models.mjs (gibt nie den Key aus)
const key = process.env.GEMINI_API_KEY
if (!key) {
  console.error("GEMINI_API_KEY fehlt (pnpm env:pull ausgeführt?)")
  process.exit(1)
}

const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", { headers: { "x-goog-api-key": key } })
if (!res.ok) {
  console.error(`Gemini API ${res.status}`)
  process.exit(1)
}

const { models } = await res.json()
for (const model of models) {
  const id = model.name.replace("models/", "")
  if (/flash|embedding|tts/.test(id)) console.log(id.padEnd(40), (model.supportedGenerationMethods ?? []).join(", "))
}
