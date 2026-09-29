import { GoogleGenAI } from "@google/genai"
import { env } from "cloudflare:workers"
import { SPEAKER_LABELS } from "./audio"

let client: GoogleGenAI | null = null

export function getGemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  return client
}

// Deutschtaugliche Prebuilt-Stimmen. Index 0/1 entsprechen SPEAKER_LABELS.
const VOICES = ["Kore", "Puck"] as const

// Roh-Audio-Parameter von Gemini TTS: 16-bit PCM, 24 kHz, mono.
const SAMPLE_RATE = 24000
const CHANNELS = 1
const BITS = 16

export type SynthesisResult = { wav: Buffer; durationSeconds: number }

// Vertont ein Skript. Bei speakers === 2 erwartet der Text Zeilen mit
// „Sprecher 1:" / „Sprecher 2:" (siehe lib/audio.ts).
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

  // Bei Dialog eine kurze Anweisung voranstellen, damit das Modell die Labels
  // als Sprecher erkennt statt sie vorzulesen.
  const prompt = speakers === 2 ? `Lies das folgende Gespräch zwischen ${SPEAKER_LABELS[0]} und ${SPEAKER_LABELS[1]} vor:\n\n${script}` : script

  const response = await getGemini().models.generateContent({
    model: env.GEMINI_TTS_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseModalities: ["AUDIO"], speechConfig }
  })

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!data) throw new Error("Gemini TTS lieferte keine Audiodaten")

  const pcm = Buffer.from(data, "base64")
  const wav = pcmToWav(pcm)
  const durationSeconds = Math.round(pcm.length / (SAMPLE_RATE * CHANNELS * (BITS / 8)))
  return { wav, durationSeconds }
}

// Erzeugt eine Hintergrund-Illustration via Gemini 2.5 Flash Image und liefert
// die rohen PNG-Bytes. Genutzt für die Folien der Video-Übersicht (lib/video.ts).
export async function generateImage(prompt: string): Promise<Buffer> {
  const response = await getGemini().models.generateContent({
    model: env.GEMINI_IMAGE_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseModalities: ["IMAGE"] }
  })

  // Das Modell kann mehrere Parts liefern (Text + Bild) – das erste inlineData nehmen.
  const parts = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  const data = imagePart?.inlineData?.data
  if (!data) throw new Error("Gemini Image lieferte keine Bilddaten")
  return Buffer.from(data, "base64")
}

// Verpackt rohes PCM in einen WAV-Container (44-Byte-Header). Kein externer
// Encoder nötig – MP3 würde ffmpeg erfordern.
function pcmToWav(pcm: Buffer): Buffer {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS) / 8
  const blockAlign = (CHANNELS * BITS) / 8
  const header = Buffer.alloc(44)

  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16) // PCM-Subchunk-Größe
  header.writeUInt16LE(1, 20) // AudioFormat = PCM
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(BITS, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([header, pcm])
}
