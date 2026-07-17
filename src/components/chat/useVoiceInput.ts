'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Spracheingabe — Neubau nach den Empfehlungen aus Speechmatics' eigenem
 * Leitfaden (blog.speechmatics.com/browser-microphone-access):
 *
 *  1. Berechtigung VORAB per Permissions API prüfen (statt den Nutzer klicken
 *     und ins Leere laufen zu lassen). Bei 'denied' zeigt die UI sofort den
 *     ehrlichen Zustand + den Datei-Weg.
 *  2. getUserMedia NUR auf echte Nutzeraktion (im Klick-Handler, kein await
 *     davor) — sonst blocken manche Browser still.
 *  3. Kein Vorab-Erklär-Popup (rät der Leitfaden ausdrücklich ab).
 *
 * WICHTIG — die harte Grenze: Ein einmal auf „blockiert" gesetztes Recht kann
 * KEINE Website per Code aufheben (gilt für alle Anbieter). Deshalb gibt es
 * `transcribeFile`: über <input type="file" accept="audio/*" capture> übergibt
 * der Browser an den OS-Recorder (Android) bzw. den Datei-Dialog — das braucht
 * die Website-Mikro-Berechtigung GAR NICHT. So landet niemand in der Sackgasse.
 */

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

interface UseVoiceInputArgs {
  onTranscript: (text: string) => void
  language?: string
}

export interface UseVoiceInputResult {
  /** Server-STT aktiv UND Browser kann aufnehmen. */
  supported: boolean
  /** Touch-Gerät (Handy/Tablet): dort ist der Datei-Weg der OS-Recorder (sinnvoll);
   *  am Desktop wäre es ein Datei-Dialog (Sackgasse). Steuert das denied-Verhalten. */
  isTouch: boolean
  /** Vorab geprüfter Berechtigungs-Zustand (Permissions API). */
  permission: MicPermission
  recording: boolean
  transcribing: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => void
  /** Fallback ohne jede Website-Berechtigung: fertige Audiodatei transkribieren. */
  transcribeFile: (file: File) => Promise<void>
  clearError: () => void
}

const RECORDING_MIMETYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const

function pickMimeType(): string {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  for (const mt of RECORDING_MIMETYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mt)) return mt
    } catch {
      /* alte Browser werfen statt false — ignorieren */
    }
  }
  return ''
}

function extFromMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useVoiceInput(args: UseVoiceInputArgs): UseVoiceInputResult {
  const [supported, setSupported] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const [permission, setPermission] = useState<MicPermission>('unknown')
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

  // ── Mount: Fähigkeiten + Berechtigung vorab klären ────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const canRecord =
      typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

    // Touch-Gerät? Am Handy öffnet der Datei-Weg den OS-Recorder (sinnvoll), am
    // Desktop nur einen Datei-Dialog (Sackgasse) → dort führen wir zur Freigabe.
    setIsTouch(
      (window.matchMedia?.('(pointer: coarse)')?.matches ?? false) ||
      (navigator.maxTouchPoints ?? 0) > 0,
    )

    // Der Button zeigt sich, sobald der Browser aufnehmen kann — SOFORT und
    // synchron. WICHTIG: NICHT vom async /api/transcribe-Ergebnis abhängig
    // machen. Sonst konnte ein Mount→Cleanup→Mount-Rennen beim Laden (cancelled
    // wurde true, BEVOR die .then lief) `supported` dauerhaft auf false hängen
    // lassen → die ganze Mikro-UI fehlte flaky ("Mikro geht mal, geht mal nicht").
    // Der Server-Check darf nur noch DOWNGRADEN, wenn STT wirklich aus ist.
    if (canRecord) setSupported(true)
    void fetch('/api/transcribe', { method: 'GET' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { enabled?: boolean } | null) => {
        if (!cancelled && j && j.enabled === false) setSupported(false)
      })
      .catch(() => { /* transient: Button bleibt; ein echter POST-Fehler zeigt sich dann sichtbar */ })

    // Berechtigung VORAB lesen. 'microphone' ist nicht überall als
    // PermissionName implementiert (Safari/Firefox) → dann 'unknown', und wir
    // verhalten uns wie bei 'prompt'.
    let statusRef: PermissionStatus | null = null
    const onChange = () => {
      if (!cancelled && statusRef) setPermission(statusRef.state as MicPermission)
    }
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then(status => {
        if (cancelled) return
        statusRef = status
        setPermission(status.state as MicPermission)
        status.addEventListener('change', onChange)
      })
      .catch(() => { if (!cancelled) setPermission('unknown') })

    return () => {
      cancelled = true
      statusRef?.removeEventListener('change', onChange)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    setRecording(false)
  }, [])

  // ── Upload + Transkription (geteilt von Aufnahme und Datei-Fallback) ───────
  const upload = useCallback(async (blob: Blob, filename: string) => {
    setTranscribing(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('audio', blob, filename)
      fd.append('language', langRef.current)
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null
      if (!res.ok || !json) throw new Error(json?.error ?? 'Transkription fehlgeschlagen')
      const text = (json.text ?? '').trim()
      if (!text) {
        setError('Da war nichts Verständliches drin — nochmal?')
        return
      }
      onTranscriptRef.current(text)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transkription fehlgeschlagen')
    } finally {
      setTranscribing(false)
    }
  }, [])

  // ── Live-Aufnahme (braucht die Website-Berechtigung) ───────────────────────
  const start = useCallback(async (): Promise<void> => {
    if (recording || transcribing) return
    setError(null)
    try {
      // Kein await vor getUserMedia → Nutzergeste bleibt erhalten.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      setPermission('granted')

      const mime = pickMimeType()
      mimeRef.current = mime
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = ev => { if (ev.data?.size > 0) chunksRef.current.push(ev.data) }
      rec.onerror = () => { setError('Aufnahme fehlgeschlagen'); cleanup() }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        cleanup()
        if (blob.size > 0) void upload(blob, `aufnahme.${extFromMime(mime || 'audio/webm')}`)
      }
      rec.start()
      setRecording(true)
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name ?? ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        // Kein Code der Welt kann das aufheben → Zustand ehrlich setzen, die UI
        // bietet daraufhin den Datei-/Recorder-Weg an.
        setPermission('denied')
        setError(null)
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('Kein Mikrofon gefunden.')
      } else {
        setError(e instanceof Error ? e.message : 'Mikrofon konnte nicht gestartet werden')
      }
      cleanup()
    }
  }, [recording, transcribing, cleanup, upload])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else cleanup()
  }, [cleanup])

  // ── Datei-Fallback: OS-Recorder (Android) bzw. Datei-Dialog ────────────────
  const transcribeFile = useCallback(async (file: File) => {
    if (!file || transcribing) return
    await upload(file, file.name || 'sprachnachricht.m4a')
  }, [transcribing, upload])

  const clearError = useCallback(() => setError(null), [])

  return { supported, isTouch, permission, recording, transcribing, error, start, stop, transcribeFile, clearError }
}
