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
  clearError: () => void
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

/**
 * Atlas (OpenAI-Browser, Chromium-basiert) hat Web Speech API laut
 * Stand 2026-06 deaktiviert — vermutlich reservieren sie das Mikro für
 * eigene Agent-Features. Wenn webkitSpeechRecognition fehlt UND der UA
 * "Atlas" enthält, geben wir dem User einen klaren Hinweis statt nur
 * "Browser unterstützt das nicht".
 *
 * UA-Pattern bewusst breit gewählt — Atlas-UAs sind nicht stabil
 * dokumentiert. Wenn Detection vorbeischiesst: Console-Log am Mount
 * (s.u.) zeigt den echten UA, dann gezielt nachschärfen.
 */
function detectAtlas(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Atlas/i.test(navigator.userAgent)
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
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const hasGetUserMedia = typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia

    // Diagnose-Log für Browser-Kompatibilitätsdebugging (Atlas etc.).
    // Bewusst console.info statt console.log — bleibt in Production-Builds
    // sichtbar, ist aber nicht als Error/Warn markiert.
    console.info('[useSpeechInput] init', {
      hasSpeechRecognition: typeof window !== 'undefined' && 'SpeechRecognition' in window,
      hasWebkitSpeechRecognition: typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
      hasGetUserMedia,
      userAgent: ua,
    })

    if (!Ctor) {
      setSupported(false)
      if (detectAtlas()) {
        setUnsupportedReason(
          'Atlas-Browser unterstützt die Web-Speech-API derzeit nicht. ' +
          'Für Spracheingabe: Chrome, Edge oder Safari verwenden — ' +
          'oder ohne Mikro tippen.'
        )
      } else if (/Firefox/.test(ua)) {
        setUnsupportedReason('Firefox unterstützt Spracheingabe (noch) nicht. Verwende Chrome, Edge oder Safari.')
      } else {
        setUnsupportedReason('Dein Browser unterstützt keine Spracheingabe.')
      }
      return
    }
    setSupported(true)
    // Wir checken die Mikrofon-Permission NICHT proaktiv beim Mount.
    // Wenn der User das Feature gar nicht nutzt, soll auch keine Warnung
    // den Chat-Screen mit Banner blockieren. Der Fehler erscheint erst
    // dann, wenn der User wirklich auf den Mikro-Button klickt und es
    // fehlschlägt (siehe rec.onerror unten).
  }, [])

  function clearError() {
    setError(null)
  }

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

  async function ensureMicPermission(): Promise<'granted' | 'denied' | 'unknown'> {
    if (typeof navigator === 'undefined') return 'unknown'

    // Permissions API: liefert "granted" / "prompt" / "denied" wenn unterstützt
    type PermState = 'granted' | 'prompt' | 'denied' | 'unknown'
    let perm: PermState = 'unknown'
    try {
      const navWithPerm = navigator as Navigator & {
        permissions?: { query: (q: { name: string }) => Promise<{ state: string }> }
      }
      if (navWithPerm.permissions?.query) {
        const r = await navWithPerm.permissions.query({ name: 'microphone' as PermissionName })
        perm = r.state as PermState
      }
    } catch {/* manche Browser kennen 'microphone' nicht — egal */}

    if (perm === 'denied') return 'denied'

    // Wenn perm === 'prompt' ODER 'unknown' → explizit per getUserMedia anfragen,
    // damit Chrome den nativen Permission-Popup öffnet (wie bei ChatGPT/Claude).
    // webkitSpeechRecognition.start() alleine triggert den Popup auf aktuellen
    // Chrome-Versionen nicht mehr zuverlässig.
    if (perm !== 'granted' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Wir wollten nur die Permission — Stream sofort wieder freigeben
        stream.getTracks().forEach(t => t.stop())
        return 'granted'
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name ?? ''
        if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError(friendlyError('audio-capture'))
          return 'denied'
        }
        return 'denied'
      }
    }
    return perm === 'granted' ? 'granted' : 'unknown'
  }

  async function start() {
    if (typeof window === 'undefined') return
    if (!getCtor()) {
      setError('Spracheingabe in diesem Browser nicht verfügbar.')
      return
    }
    if (listening) return // bereits aktiv → ignorieren

    setError(null)

    // Vor SpeechRecognition.start() explizit die Mikrofon-Permission holen.
    // Das triggert den nativen Chrome-Popup (falls noch nicht entschieden)
    // und zeigt eine klare Fehlermeldung wenn der User irgendwann "blockiert" geklickt hat.
    const permResult = await ensureMicPermission()
    if (permResult === 'denied') {
      setError(friendlyError('not-allowed'))
      return
    }

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

  return { supported, listening, start, stop, clearError, error, unsupportedReason }
}
