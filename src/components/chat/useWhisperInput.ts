'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Whisper-Fallback für Browser ohne (oder ohne aktivierte) Web Speech API.
 *
 * Pattern:
 *   1. start()  → MediaRecorder beginnt webm/opus-Aufnahme.
 *   2. User spricht.
 *   3. stop()   → Recorder stoppt, alle Chunks werden zu einem Blob, POST
 *                 an /api/transcribe, Antwort kommt zurück → onTranscript.
 *
 * Im Gegensatz zu useSpeechInput ist das NICHT live. Erst nach stop()
 * fliesst der Text — UI sollte "Aufnahme läuft …" und "Transkribiere …"
 * separat anzeigen (siehe ChatView).
 *
 * Vorteile gegenüber Web Speech API:
 *  • Funktioniert in jedem Browser mit MediaRecorder + getUserMedia
 *    (Chromium, Safari, Firefox, OpenAI Atlas — alle, die ein Mikro
 *    überhaupt zulassen).
 *  • Genauere Transkription (Whisper > Browser-STT in den meisten Fällen).
 *  • Eine API-Key-Strategie reicht für alle User-Browser.
 *
 * Nachteile:
 *  • Server-Roundtrip → 1–4 s Latenz pro Aufnahme.
 *  • Audio fliesst über deinen Server (bzw. den konfigurierten STT-Provider).
 *  • Kosten ~$0.006/Min @ OpenAI whisper-1.
 */

interface UseWhisperInputArgs {
  /** Wird mit dem fertigen Transkript einmalig pro Aufnahme aufgerufen. */
  onTranscript: (text: string) => void
  /** ISO-639-1 Sprache, default "de". */
  language?: string
}

interface UseWhisperInputResult {
  /** Wahr, sobald der Hook beim Mount geprüft hat, dass die Route enabled
   *  ist UND der Browser MediaRecorder + getUserMedia kennt. */
  supported: boolean
  /** Recording läuft gerade. */
  recording: boolean
  /** Audio wurde gestoppt, Upload + Transkription läuft. */
  transcribing: boolean
  /** Benutzerfreundliche Fehlerbeschreibung. */
  error: string | null
  start: () => Promise<void>
  stop: () => void
  clearError: () => void
}

const RECORDING_MIMETYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

function pickMimeType(): string | null {
  if (typeof window === 'undefined') return null
  const MR = window.MediaRecorder
  if (!MR) return null
  for (const mt of RECORDING_MIMETYPES) {
    try {
      if (MR.isTypeSupported(mt)) return mt
    } catch {
      // Manche alten Browser werfen statt false zurückzugeben — ignorieren
    }
  }
  // Browser ohne isTypeSupported (älter Safari) — versuchen ohne MIME-Hint
  return ''
}

function extFromMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useWhisperInput(args: UseWhisperInputArgs): UseWhisperInputResult {
  const [supported, setSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const mimeRef = useRef<string>('')
  const onTranscriptRef = useRef(args.onTranscript)
  onTranscriptRef.current = args.onTranscript
  const langRef = useRef(args.language ?? 'de')
  langRef.current = args.language ?? 'de'

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const hasRecorder = typeof window.MediaRecorder !== 'undefined'
    const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia
    if (!hasRecorder || !hasGetUserMedia) {
      setSupported(false)
      return
    }

    // Beim Mount prüfen, ob die Server-Route aktiviert ist. Ohne STT-Provider
    // hat der Button keinen Sinn → wir blenden ihn dann aus.
    void fetch('/api/transcribe', { method: 'GET' })
      .then(r => r.ok ? r.json() : null)
      .then((j: { enabled?: boolean } | null) => {
        if (!cancelled) setSupported(Boolean(j?.enabled))
      })
      .catch(() => { if (!cancelled) setSupported(false) })

    return () => {
      cancelled = true
      // Mic-Stream beim Unmount freigeben (z.B. Navigation während Aufnahme)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  function clearError() { setError(null) }

  async function start(): Promise<void> {
    if (recording || transcribing) return
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const mime = pickMimeType() ?? ''
      mimeRef.current = mime
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onerror = (ev: Event) => {
        const err = (ev as unknown as { error?: { message?: string } }).error
        setError(err?.message ?? 'Aufnahme fehlgeschlagen')
        cleanup()
      }
      rec.onstop = () => {
        // upload separat (siehe stop()), hier nur State
        setRecording(false)
      }

      rec.start()
      setRecording(true)
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name ?? ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(
          'Mikrofon-Zugriff blockiert. So freischalten:\n' +
          '• Chrome/Edge: 🔒-Symbol in der Adresszeile → Mikrofon → Erlauben\n' +
          '• OpenAI Atlas: Settings → Web Browsing and security → Site settings → Microphone → diese Seite auf „Allow" setzen\n' +
          '• Safari: Einstellungen für diese Website → Mikrofon „Erlauben"\n' +
          'Danach Mikro-Button erneut drücken.'
        )
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('Kein Mikrofon gefunden. Prüfe die System-Einstellungen.')
      } else {
        setError(e instanceof Error ? e.message : 'Mikrofon konnte nicht gestartet werden')
      }
      cleanup()
    }
  }

  function stop(): void {
    const rec = recorderRef.current
    if (!rec) {
      cleanup()
      return
    }
    if (rec.state === 'inactive') {
      void uploadAndDispatch()
      return
    }
    // onstop feuert async; wir hängen den Upload in den onstop-Handler ein,
    // damit alle ondataavailable-Events sicher reingelaufen sind.
    const originalOnStop = rec.onstop
    rec.onstop = (ev) => {
      try { originalOnStop?.call(rec, ev) } catch { /* ignore */ }
      setRecording(false)
      void uploadAndDispatch()
    }
    try {
      rec.stop()
    } catch {
      void uploadAndDispatch()
    }
  }

  async function uploadAndDispatch(): Promise<void> {
    // Stream sofort freigeben — Mikro-LED muss aus sein, auch wenn der Upload
    // noch hängt.
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    const chunks = chunksRef.current
    chunksRef.current = []
    if (chunks.length === 0) {
      cleanup()
      return
    }

    const mime = mimeRef.current || 'audio/webm'
    const blob = new Blob(chunks, { type: mime })
    if (blob.size < 200) {
      // Sehr kurze Aufnahmen ergeben praktisch nie verwertbaren Text — sparen
      // wir uns Tokens + Roundtrip.
      setError('Aufnahme zu kurz — drück das Mikro länger.')
      cleanup()
      return
    }

    setTranscribing(true)
    try {
      const fd = new FormData()
      fd.append('audio', blob, `aufnahme.${extFromMime(mime)}`)
      fd.append('language', langRef.current)
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(errJson?.error ?? `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { text?: string }
      const text = (json.text ?? '').trim()
      if (text) onTranscriptRef.current(text)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transkription fehlgeschlagen')
    } finally {
      setTranscribing(false)
    }
  }

  function cleanup() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    setRecording(false)
  }

  return { supported, recording, transcribing, error, start, stop, clearError }
}
