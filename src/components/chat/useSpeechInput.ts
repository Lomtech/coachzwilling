'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Spracheingabe V1 — browser-natives Web Speech API.
 *
 * Vorteile:
 * - Kostenlos, läuft komplett im Browser
 * - DSGVO-unkritisch (kein Audio-Upload an unsere Server)
 *
 * Browser-Realität (was wir hier kompensieren):
 * - Chrome/Edge Desktop: voll OK, continuous=true klappt
 * - Safari Desktop (>= 14.1): OK, aber webkit-prefixed
 * - iOS Safari: continuous=true bricht nach ~5s ab → wir setzen continuous=false
 *   und starten bei jedem onend automatisch neu, solange der User nicht stoppt
 * - Firefox: keine Implementierung → supported=false, Button zeigt Begründung
 * - Permission "blocked": früher silent fail, jetzt prominenter Hinweis
 *
 * Für V2 könnten wir auf Whisper API umsteigen (höhere Genauigkeit,
 * aber Audio-Upload + API-Kosten + DSGVO-Aufwand).
 */

interface UseSpeechInputResult {
  supported: boolean
  listening: boolean
  start: () => void
  stop: () => void
  error: string | null
  unsupportedReason: string | null
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

function getCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition
  )
}

function detectIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIos && isSafari
}

function friendlyError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon-Zugriff blockiert. Klick auf das 🔒-Symbol in der Adresszeile und erlaube das Mikrofon — dann den Mikro-Button erneut drücken.'
    case 'audio-capture':
      return 'Kein Mikrofon gefunden. Prüfe die System-Einstellungen.'
    case 'network':
      return 'Spracherkennung braucht eine aktive Internet-Verbindung.'
    case 'language-not-supported':
      return 'Deutsch wird in diesem Browser nicht unterstützt.'
    default:
      return `Mikrofon-Fehler: ${code}`
  }
}

export function useSpeechInput(args: {
  onTranscript: (text: string, isFinal: boolean) => void
  lang?: string
}): UseSpeechInputResult {
  const [supported, setSupported] = useState(false)
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionInstance | null>(null)
  // User-Intent vs Browser-Realität trennen: bei iOS muss continuous-Replacement
  // auf onend neu starten, aber nur wenn der User nicht "Stopp" gedrückt hat.
  const userWantsListeningRef = useRef(false)
  const onTranscriptRef = useRef(args.onTranscript)
  onTranscriptRef.current = args.onTranscript

  useEffect(() => {
    if (typeof window === 'undefined') return
    const Ctor = getCtor()
    if (!Ctor) {
      setSupported(false)
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      if (/Firefox/.test(ua)) {
        setUnsupportedReason('Firefox unterstützt Spracheingabe (noch) nicht. Verwende Chrome, Edge oder Safari.')
      } else {
        setUnsupportedReason('Dein Browser unterstützt keine Spracheingabe.')
      }
      return
    }
    setSupported(true)

    // Proaktiver Check: ist die Mikrofon-Berechtigung permanent blockiert?
    // Permissions API ist nicht überall, daher try/catch + permissive Default.
    try {
      const navWithPerm = navigator as Navigator & {
        permissions?: { query: (q: { name: string }) => Promise<{ state: string }> }
      }
      if (navWithPerm.permissions?.query) {
        navWithPerm.permissions
          .query({ name: 'microphone' as PermissionName })
          .then(p => {
            if (p.state === 'denied') {
              setError(friendlyError('not-allowed'))
            }
          })
          .catch(() => {/* Browser kennt 'microphone' nicht — egal */})
      }
    } catch {
      // Permissions-API nicht da — egal, beim Klick wird's eh angefragt
    }
  }, [])

  function buildRecognition(): SpeechRecognitionInstance | null {
    const Ctor = getCtor()
    if (!Ctor) return null

    const rec = new Ctor()
    rec.lang = args.lang ?? 'de-DE'
    // iOS Safari ignoriert continuous=true real (max ~5s) → wir starten
    // bei onend einfach neu, das fühlt sich kontinuierlich an.
    const ios = detectIosSafari()
    rec.continuous = !ios
    rec.interimResults = true

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i]
        const transcript = result[0]?.transcript ?? ''
        onTranscriptRef.current(transcript, result.isFinal)
      }
    }
    rec.onerror = (ev: { error: string }) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') {
        // Stille / vom User gestoppt — kein Banner, aber Listening stoppen
        // damit onend den Status sauber zurücksetzt.
        return
      }
      setError(friendlyError(ev.error))
      userWantsListeningRef.current = false
      setListening(false)
    }
    rec.onend = () => {
      // Wenn der User noch sprechen will (iOS-Auto-Stop oder kurzer Drop),
      // direkt wieder starten. Sonst: Status auf "off".
      if (userWantsListeningRef.current) {
        try {
          rec.start()
          return
        } catch {
          // Falls Browser parallel-start ablehnt → sauber beenden
        }
      }
      setListening(false)
    }
    return rec
  }

  function start() {
    if (typeof window === 'undefined') return
    if (!getCtor()) {
      setError('Spracheingabe in diesem Browser nicht verfügbar.')
      return
    }
    if (listening) return // bereits aktiv → ignorieren

    setError(null)
    try {
      // Falls noch eine alte Instance läuft → abort
      recRef.current?.abort()
      const rec = buildRecognition()
      if (!rec) return
      recRef.current = rec
      userWantsListeningRef.current = true
      rec.start()
      setListening(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Spracheingabe konnte nicht gestartet werden'
      // Häufigster Fall: "InvalidStateError: ... already started"
      if (/already started|InvalidState/.test(msg)) {
        setListening(true) // tatsächlich läuft was → UI sync
        return
      }
      setError(msg)
      userWantsListeningRef.current = false
      setListening(false)
    }
  }

  function stop() {
    userWantsListeningRef.current = false
    try {
      recRef.current?.stop()
    } catch {
      // ignore
    }
    setListening(false)
  }

  useEffect(() => {
    return () => {
      userWantsListeningRef.current = false
      try {
        recRef.current?.abort()
      } catch {
        // ignore
      }
    }
  }, [])

  return { supported, listening, start, stop, error, unsupportedReason }
}
