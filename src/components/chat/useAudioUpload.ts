'use client'

import { useRef, useState } from 'react'

/**
 * Audio-Upload-Hook als Fallback zum Web-Speech-API.
 *
 * Use-Case: User hat in seinem Browser die Mikrofon-Permission für unsere
 * Domain dauerhaft auf "Block" — Chrome remembers das per-site und es lässt
 * sich nur in den Settings ändern. Damit der User trotzdem sprechen kann,
 * lädt er hier eine vor-aufgenommene Audio-Datei hoch (Voice-Memo auf Mac,
 * iPhone-Sprachnotiz, jede beliebige MP3/M4A/WAV).
 *
 * Server transkribiert via Whisper-1 → Text landet im onTranscript-Callback.
 */

interface UseAudioUploadResult {
  uploading: boolean
  error: string | null
  trigger: () => void
  clearError: () => void
}

export function useAudioUpload(args: {
  onTranscript: (text: string) => void
}): UseAudioUploadResult {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function ensureInput(): HTMLInputElement {
    if (fileInputRef.current) return fileInputRef.current
    const input = document.createElement('input')
    input.type = 'file'
    // Akzeptierte Audio-Formate — Whisper akzeptiert die meisten gängigen
    input.accept = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg,.flac'
    input.style.display = 'none'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      input.value = '' // damit gleiche Datei nochmal hochladbar ist
      if (!file) return
      await upload(file)
    })
    document.body.appendChild(input)
    fileInputRef.current = input
    return input
  }

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('audio', file)
      form.append('lang', 'de')
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null
      if (!res.ok || !json?.ok || !json.text) {
        throw new Error(json?.error ?? `HTTP ${res.status}`)
      }
      args.onTranscript(json.text)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transcription fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  function trigger() {
    ensureInput().click()
  }

  function clearError() {
    setError(null)
  }

  return { uploading, error, trigger, clearError }
}
