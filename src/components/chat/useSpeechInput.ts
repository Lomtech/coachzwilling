'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Spracheingabe V1 — browser-natives Web Speech API.
 *
 * Vorteile:
 * - Kostenlos, läuft komplett im Browser
 * - DSGVO-unkritisch (kein Audio-Upload an unsere Server)
 * - Funktioniert in Chrome/Edge/Safari (>= 14.1) auf Desktop und mobil
 *
 * Limitierungen:
 * - Firefox unterstützt es (noch) nicht
 * - Genauigkeit variiert je nach Browser-Engine
 *
 * Für V2 könnten wir auf Whisper API umsteigen (höhere Genauigkeit,
 * aber Audio-Upload + API-Kosten).
 */

interface UseSpeechInputResult {
  supported: boolean
  listening: boolean
  start: () => void
  stop: () => void
  error: string | null
}

// Minimale Browser-Typen für Web Speech API (sind in TS-DOM-Lib nicht enthalten)
interface SpeechRecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string }
    }
  }
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

export function useSpeechInput(args: {
  onTranscript: (text: string, isFinal: boolean) => void
  lang?: string
}): UseSpeechInputResult {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Webkit-Präfix für Safari/Chrome
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    if (!Ctor) {
      setSupported(false)
      return
    }
    setSupported(true)
  }, [])

  function start() {
    if (typeof window === 'undefined') return
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
    if (!Ctor) {
      setError('Spracheingabe in diesem Browser nicht verfügbar.')
      return
    }

    setError(null)
    try {
      const rec = new Ctor()
      rec.lang = args.lang ?? 'de-DE'
      rec.continuous = true
      rec.interimResults = true

      rec.onresult = (ev: SpeechRecognitionEvent) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const result = ev.results[i]
          const transcript = result[0]?.transcript ?? ''
          args.onTranscript(transcript, result.isFinal)
        }
      }
      rec.onerror = (ev: { error: string }) => {
        if (ev.error === 'no-speech' || ev.error === 'aborted') {
          // Stille / vom User gestoppt — kein Fehler-Banner
          return
        }
        setError(`Mikrofon-Fehler: ${ev.error}`)
        setListening(false)
      }
      rec.onend = () => {
        setListening(false)
      }

      rec.start()
      recRef.current = rec
      setListening(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Spracheingabe konnte nicht gestartet werden')
      setListening(false)
    }
  }

  function stop() {
    recRef.current?.stop()
    setListening(false)
  }

  useEffect(() => {
    return () => {
      recRef.current?.abort()
    }
  }, [])

  return { supported, listening, start, stop, error }
}
