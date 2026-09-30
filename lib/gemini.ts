import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai"
import { env } from "cloudflare:workers"
import { SPEAKER_LABELS, splitDialog } from "./audio"
import { pcmSeconds, pcmToWav, stripWavHeader } from "./wav"

let client: GoogleGenAI | null = null

export function getGemini(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      // Ohne retryOptions wiederholt das SDK gar nicht. 429 bewusst nicht: im
      // Free Tier ist dann meist das Kontingent aufgebraucht.
      httpOptions: { retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 8, httpStatusCodes: [500, 502, 503, 504] } }
    })
  }
  return client
}

const modelChain = (list: string) =>
  list
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)

export const chatModels = () => modelChain(env.GEMINI_CHAT_MODELS)
export const reportModels = () => modelChain(env.GEMINI_REPORT_MODELS)

const isOverloaded = (err: unknown) => err instanceof ApiError && err.status >= 500
const isQuotaExceeded = (err: unknown) => err instanceof ApiError && err.status === 429

// Überlastung und Kontingent gelten pro Modell, das nächste Modell der Kette kann dann
// noch antworten. run() muss vor der ersten Ausgabe scheitern, sonst käme Text doppelt.
export async function withFallback<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  for (const [i, model] of models.entries()) {
    try {
      return await run(model)
    } catch (err) {
      if (i === models.length - 1 || !(isOverloaded(err) || isQuotaExceeded(err))) throw err
      console.warn(`Modell ${model} nicht verfügbar, weiche auf ${models[i + 1]} aus:`, err)
    }
  }
  throw new Error("Keine Gemini-Modelle konfiguriert")
}

// Für den Client: nie den rohen ApiError weitergeben.
export function geminiErrorMessage(err: unknown): string {
  if (isOverloaded(err)) return "Das KI-Modell ist gerade überlastet. Bitte versuche es in ein paar Sekunden erneut."
  if (isQuotaExceeded(err)) return "Das Anfragekontingent ist gerade ausgeschöpft. Bitte versuche es später erneut."
  return "Die Antwort konnte nicht erzeugt werden. Bitte versuche es erneut."
}

type GenerateTextOptions = {
  models: string[]
  system: string
  prompt: string
  maxOutputTokens: number
  // Gemini-3-Modelle denken, und Denk-Tokens zählen gegen maxOutputTokens. Bei
  // kleinen Budgets käme sonst eine leere Antwort zurück.
  minimalThinking?: boolean
  jsonSchema?: object
}

export async function generateText({ models, system, prompt, maxOutputTokens, minimalThinking, jsonSchema }: GenerateTextOptions): Promise<string> {
  const response = await withFallback(models, (model) =>
    getGemini().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens,
        ...(minimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
        ...(jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: jsonSchema } : {})
      }
    })
  )
  return (response.text ?? "").trim()
}

const VOICES = ["Kore", "Puck"] as const

export type SynthesisResult = { wav: Buffer; durationSeconds: number }

// Bei speakers === 2 muss jede Wortmeldung mit einem der SPEAKER_LABELS beginnen.
export async function synthesizeSpeech(script: string, speakers: 1 | 2): Promise<SynthesisResult> {
  const speechConfig =
    speakers === 2
      ? {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: SPEAKER_LABELS.map((speaker, i) => ({
              speaker,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[i] } }
            }))
          }
        }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[0] } } }

  // Die Lite-TTS-Modelle verlangen bei mehreren Stimmen jede Wortmeldung als eigenen Part
  // mit speechMetadata.speaker, ein Part ohne Sprecher (auch eine Anweisung) ergibt 400.
  const parts =
    speakers === 2 ? splitDialog(script).map((turn) => ({ text: turn.text, speechMetadata: { speaker: turn.speaker } })) : [{ text: script }]
  if (parts.length === 0) throw new Error("Skript ohne Sprechtext")

  const response = await withFallback(modelChain(env.GEMINI_TTS_MODELS), (model) =>
    getGemini().models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["AUDIO"], speechConfig }
    })
  )

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!data) throw new Error("Gemini TTS lieferte keine Audiodaten")

  const pcm = stripWavHeader(Buffer.from(data, "base64"))
  const wav = pcmToWav(pcm)
  const durationSeconds = Math.round(pcmSeconds(pcm))
  return { wav, durationSeconds }
}
