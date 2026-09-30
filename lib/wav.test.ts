import { describe, expect, it } from "vitest"
import { pcmSeconds, pcmToWav, stripWavHeader } from "./wav"

const chunk = (id: string, data: Buffer) => {
  const header = Buffer.alloc(8)
  header.write(id, 0)
  header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
}

const riff = (...chunks: Buffer[]) => {
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.write("RIFF", 0)
  header.writeUInt32LE(4 + body.length, 4)
  header.write("WAVE", 8)
  return Buffer.concat([header, body])
}

describe("pcmToWav", () => {
  it("schreibt genau einen 44-Byte-Header für 24 kHz, 16 bit, mono", () => {
    const pcm = Buffer.from([1, 2, 3, 4])
    const wav = pcmToWav(pcm)

    expect(wav).toHaveLength(44 + pcm.length)
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF")
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE")
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(24000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(pcm.length)
  })
})

describe("stripWavHeader", () => {
  it("lässt Roh-PCM unverändert", () => {
    const pcm = Buffer.from([9, 8, 7])
    expect(stripWavHeader(pcm)).toEqual(pcm)
  })

  it("holt die Audiodaten aus einem WAV zurück", () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6])
    expect(stripWavHeader(pcmToWav(pcm))).toEqual(pcm)
  })

  it("überspringt zusätzliche Chunks inklusive Füllbyte", () => {
    const pcm = Buffer.from([1, 2, 3, 4])
    const wav = riff(chunk("fmt ", Buffer.alloc(16)), chunk("LIST", Buffer.from([1, 2, 3])), chunk("data", pcm))
    expect(stripWavHeader(wav)).toEqual(pcm)
  })

  it("wirft bei einem WAV ohne data-Chunk", () => {
    expect(() => stripWavHeader(riff(chunk("fmt ", Buffer.alloc(16))))).toThrow("ohne Audiodaten")
  })
})

describe("pcmSeconds", () => {
  it("rechnet mit 48.000 Bytes pro Sekunde", () => {
    expect(pcmSeconds(Buffer.alloc(48000 * 3))).toBe(3)
  })
})
