import { useCallback, useEffect, useRef, useState } from "react"

// Diktat per Web Speech API (Browser-nativ, kostenlos, Echtzeit). Funktioniert
// in Chrome/Edge; wird der Konstruktor nicht gefunden, ist `supported` false.

// Minimaltypen – die Web Speech API ist nicht in den Standard-DOM-Typen enthalten.
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(lang = "de-DE") {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onUpdateRef = useRef<(text: string) => void>(() => {})
  const finalRef = useRef("")

  useEffect(() => {
    setSupported(getCtor() !== null)
    return () => recognitionRef.current?.abort()
  }, [])

  // Startet das Diktat. `onUpdate` erhält fortlaufend den aktuellen Transkript-
  // Text (finale + vorläufige Teile) dieser Sitzung.
  const start = useCallback(
    (onUpdate: (text: string) => void) => {
      const Ctor = getCtor()
      if (!Ctor) return
      onUpdateRef.current = onUpdate
      finalRef.current = ""

      const recognition = new Ctor()
      recognition.lang = lang
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onresult = (e) => {
        let interim = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]
          if (result.isFinal) finalRef.current += result[0].transcript
          else interim += result[0].transcript
        }
        onUpdateRef.current(finalRef.current + interim)
      }
      recognition.onend = () => setListening(false)
      recognition.onerror = () => setListening(false)
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    },
    [lang]
  )

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { supported, listening, start, stop }
}
