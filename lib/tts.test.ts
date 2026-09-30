import { ApiError } from "@google/genai"
import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { synthesizeSpeech } from "./gemini"

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }))

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>()
  return { ...actual, GoogleGenAI: class { models = { generateContent } } }
})

const audio = (seconds: number) => ({
  candidates: [{ content: { parts: [{ inlineData: { data: Buffer.alloc(seconds * 48000).toString("base64") } }] } }]
})

const partsOf = (call: number) => generateContent.mock.calls[call][0].contents[0].parts

const DIALOG = "Sprecher 1: Hallo.\nSprecher 2: Hi!"

describe("synthesizeSpeech", () => {
  beforeEach(() => {
    generateContent.mockReset()
    Object.assign(env, { GEMINI_API_KEY: "test", GEMINI_TTS_MODELS: "tts-neu,tts-alt" })
  })

  it("schickt einen Dialog als Wortmeldungen mit speechMetadata", async () => {
    generateContent.mockResolvedValueOnce(audio(2))
    const result = await synthesizeSpeech(DIALOG, 2)

    expect(result.durationSeconds).toBe(2)
    expect(partsOf(0)).toEqual([
      { text: "Hallo.", speechMetadata: { speaker: "Sprecher 1" } },
      { text: "Hi!", speechMetadata: { speaker: "Sprecher 2" } }
    ])
  })

  it("wiederholt dasselbe Modell mit Textblock, wenn es speechMetadata ablehnt", async () => {
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "Speech metadata is not supported for this model.", status: 400 }))
      .mockResolvedValueOnce(audio(1))
    await synthesizeSpeech(DIALOG, 2)

    expect(generateContent.mock.calls.map(([req]) => req.model)).toEqual(["tts-neu", "tts-neu"])
    expect(partsOf(1)).toHaveLength(1)
    expect(partsOf(1)[0].text).toContain("Sprecher 1: Hallo.\nSprecher 2: Hi!")
  })

  it("gibt andere 400er ohne zweiten Versuch weiter", async () => {
    generateContent.mockRejectedValueOnce(new ApiError({ message: "Ungültige Anfrage", status: 400 }))
    await expect(synthesizeSpeech(DIALOG, 2)).rejects.toThrow("Ungültige Anfrage")
    expect(generateContent).toHaveBeenCalledTimes(1)
  })

  it("schickt eine einzelne Stimme als einen Textteil", async () => {
    generateContent.mockResolvedValueOnce(audio(1))
    await synthesizeSpeech("Nur ein Erzähler.", 1)
    expect(partsOf(0)).toEqual([{ text: "Nur ein Erzähler." }])
  })
})
