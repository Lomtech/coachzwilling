'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Spracheingabe V1 — browser-natives Web Speech API.
 *
 * DSGVO-EHRLICHKEIT (Stand 2026-06):
 *   Die Web Speech API ist NICHT lokal. Chrome streamt Audio an Google,
 *   Safari an Apple, Edge an Microsoft — keiner dieser Pfade hat einen
 *   AVV mit deiner Coaching-Anwendung. Wer DSGVO-strikt sein muss,
 *   setzt NEXT_PUBLIC_SPEECH_PROVIDER=disabled und nutzt ausschließlich
 *   den server-side Whisper-Fallback (useWhisperInput) mit einem
 *   EU-konformen STT-Provider (z.B. Speechmatics eu1).
 *
 * Browser-Realität (was wir hier kompensieren):
 * - Chrome/Edge Desktop: voll OK, continuous=true klappt
 * - Safari Desktop (>= 14.1): OK, aber webkit-prefixed
 * - iOS Safari: continuous=true bricht nach ~5s ab → wir setzen continuous=false
 *   und starten bei jedem onend automatisch neu, solange der User nicht stoppt
 * - Firefox: keine Implementierung → supported=false, Button zeigt Begründung
 * - OpenAI Atlas: webkitSpeechRecognition vermutlich abgeschaltet
 * - Permission "blocked": prominenter Hinweis mit browser-spezifischem Pfad
 */

/**
 * Wenn der Betreiber NEXT_PUBLIC_SPEECH_PROVIDER=disabled setzt, schalten
 * wir die Web Speech API komplett aus — damit kein Audio mehr an
 * Google/Apple/Microsoft fliesst, ohne dass der User es weiss.
 * Der Whisper-Fallback (eigener STT-Provider) bleibt davon unberührt.
 */
function isBrowserSpeechDisabled(): boolean {
  if (typeof process === 'undefined') return false
  return (process.env.NEXT_PUBLIC_SPEECH_PROVIDER ?? 'browser').toLowerCase() === 'disabled'
}

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
 * Browser-Family-Erkennung für gezielte Help-Texte bei Permission-Problemen.
 *
 * Wichtig: OpenAI Atlas hat einen Chrome-IDENTISCHEN User-Agent
 * (`Mozilla/5.0 (...) Chrome/141.0.0.0 Safari/537.36`, Quelle:
 * https://seraphicsecurity.com/learn/ai-browser/openai-atlas-browser-features-pros-cons-security-and-privacy/),
 * d.h. Atlas vs. Chrome ist clientseitig nicht zuverlässig zu unterscheiden.
 * Wir geben deshalb bei Permission-Fehlern HILFE FÜR BEIDE Browser aus —
 * der User erkennt selbst welcher Weg passt.
 */
type BrowserFamily = 'chromium' | 'safari' | 'firefox' | 'unknown'

function detectBrowserFamily(): BrowserFamily {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/Firefox/.test(ua)) return 'firefox'
  // Safari nur wenn KEIN Chrome im UA — Chrome auf macOS hat auch "Safari" im UA
  if (/Safari/.test(ua) && !/Chrome|CriOS|EdgiOS|FxiOS/.test(ua)) return 'safari'
  if (/Chrome|Chromium|Edg/.test(ua)) return 'chromium'
  return 'unknown'
}

function permissionHelpText(): string {
  const fam = detectBrowserFamily()
  // Atlas-Hinweis bei Chromium IMMER mit anbieten — Atlas tarnt sich als Chrome.
  if (fam === 'chromium') {
    return (
      'Mikrofon-Zugriff blockiert. So freischalten:\n' +
      '• Chrome/Edge: 🔒-Symbol in der Adresszeile → Mikrofon → Erlauben\n' +
      '• OpenAI Atlas: Settings → Web Browsing and security → Site settings → Microphone → diese Seite auf „Allow" setzen\n' +
      'Danach Mikro-Button erneut drücken.'
    )
  }
  if (fam === 'safari') {
    return 'Mikrofon-Zugriff blockiert. Safari → Einstellungen für diese Website → Mikrofon „Erlauben". Danach Mikro-Button erneut drücken.'
  }
  return 'Mikrofon-Zugriff blockiert. Erlaube das Mikrofon in den Browser-Einstellungen für diese Seite und drück den Mikro-Button erneut.'
}

function friendlyError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return permissionHelpText()
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

    // DSGVO-Disable-Pfad: wenn der Betreiber NEXT_PUBLIC_SPEECH_PROVIDER=disabled
    // gesetzt hat, wollen wir die Web Speech API gar nicht erst anbieten —
    // sonst leakt Audio an Google/Apple/Microsoft ohne AVV.
    if (isBrowserSpeechDisabled()) {
      setSupported(false)
      setUnsupportedReason(
        'Live-Spracheingabe ist auf diesem Deployment deaktiviert (DSGVO). ' +
        'Nutze stattdessen den Aufnahme-Button für Push-to-talk via EU-STT.'
      )
      return
    }

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
      browserSpeechDisabled: isBrowserSpeechDisabled(),
    })

    if (!Ctor) {
      setSupported(false)
      const fam = detectBrowserFamily()
      if (fam === 'firefox') {
        setUnsupportedReason('Firefox unterstützt Spracheingabe (noch) nicht. Verwende Chrome, Edge oder Safari.')
      } else if (fam === 'chromium') {
        // Chromium-Familie OHNE webkitSpeechRecognition → vermutlich OpenAI
        // Atlas (Web Speech API in einigen Atlas-Versionen ausgeblendet) oder
        // eine speziell konfigurierte Chrome-Variante. Wir nennen Atlas
        // explizit, weil das der häufigste Fall ist.
        setUnsupportedReason(
          'Dein Chrome/Chromium-basierter Browser stellt die Web-Speech-API nicht bereit. ' +
          'Wenn du OpenAI Atlas verwendest: dort ist die Browser-Spracherkennung derzeit nicht aktiviert. ' +
          'Wechsle für Spracheingabe auf Chrome, Edge oder Safari — oder tippe einfach.'
        )
      } else {
        setUnsupportedReason('Dein Browser unterstützt keine Spracheingabe. Wechsle auf Chrome, Edge oder Safari.')
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
