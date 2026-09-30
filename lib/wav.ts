// Vorgegeben durch Gemini TTS (Roh-PCM), keine Einstellung.
const SAMPLE_RATE = 24000
const CHANNELS = 1
const BITS = 16

export const pcmSeconds = (pcm: Buffer) => pcm.length / (SAMPLE_RATE * CHANNELS * (BITS / 8))

// Gemini-3.8-TTS liefert WAV, ältere Modelle Roh-PCM. Ohne Abschneiden stünde
// der Header doppelt in der Datei und die Längenberechnung wäre falsch.
export function stripWavHeader(audio: Buffer): Buffer {
  if (audio.toString("ascii", 0, 4) !== "RIFF") return audio
  let offset = 12
  while (offset + 8 <= audio.length) {
    const size = audio.readUInt32LE(offset + 4)
    if (audio.toString("ascii", offset, offset + 4) === "data") return audio.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  throw new Error("Gemini TTS lieferte WAV ohne Audiodaten")
}

// WAV statt MP3, weil MP3 einen Encoder (ffmpeg) bräuchte.
export function pcmToWav(pcm: Buffer): Buffer {
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
