import 'server-only'
import type { TranscribeArgs, TranscribeResult } from './client'

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Whisper Adapter
//
// Endpoint:        https://api.openai.com/v1/audio/transcriptions
// Modell:          whisper-1 (stable, $0.006/Min, max 25 MB)
//                  Override via OPENAI_TRANSCRIPTION_MODEL falls du auf
//                  gpt-4o-mini-transcribe / gpt-4o-transcribe wechseln willst.
// Limits:          Pro Request max 25 MB Audio (~25 Min @ webm/opus).
// DSGVO-Hinweis:   Audio fliesst zu OpenAI / USA. Anthropic-/Langdock-EU-Setup
//                  bleibt davon unberührt — STT ist ein eigenständiger
//                  Daten-Pfad. Wer EU-strikt sein muss: STT_PROVIDER=disabled.
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.OPENAI_BASE_URL
  ? `${process.env.OPENAI_BASE_URL.replace(/\/$/, '')}/audio/transcriptions`
  : 'https://api.openai.com/v1/audio/transcriptions'

const DEFAULT_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1'

export async function openaiTranscribe(args: TranscribeArgs): Promise<TranscribeResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY fehlt (STT_PROVIDER=openai)')

  // Whisper akzeptiert verbose_json + duration; wir nutzen das wenn das Modell es kann.
  // gpt-4o-*-transcribe ignoriert verbose_json — dann liefern sie nur `text`,
  // was unsere TranscribeResult-Shape eh erfüllt.
  const fd = new FormData()
  // FormData braucht ein File-artiges Objekt mit name; Blob alleine reicht in
  // node-fetch/Node-Runtime nicht zuverlässig.
  const file = new File([args.audio], args.filename, { type: args.audio.type || 'audio/webm' })
  fd.append('file', file)
  fd.append('model', DEFAULT_MODEL)
  if (args.language) fd.append('language', args.language)
  if (args.prompt) fd.append('prompt', args.prompt)
  // verbose_json funktioniert nur für whisper-1 — bei gpt-4o-* lassen wir es
  // weg und fallen zurück auf json (Default).
  if (DEFAULT_MODEL === 'whisper-1') {
    fd.append('response_format', 'verbose_json')
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI-Whisper HTTP ${res.status}: ${errText.slice(0, 300)}`)
  }

  // Whisper-1 mit verbose_json: { text, duration, language, segments, ... }
  // gpt-4o-*-transcribe: { text }
  const json = (await res.json()) as { text?: string; duration?: number }
  const text = (json.text ?? '').trim()
  return {
    text,
    durationSec: typeof json.duration === 'number' ? json.duration : undefined,
    model: DEFAULT_MODEL,
  }
}
