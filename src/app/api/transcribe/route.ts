import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Whisper-basierter Transcription-Endpoint.
 * Fallback für User die ihre Browser-Mikrofon-Permission nicht freischalten
 * können / wollen (Chrome remembers "Block" per-site permanent).
 *
 * Flow:
 *  - Frontend POSTet eine FormData mit Audio-File (MP3, M4A, WAV, WebM, etc.)
 *  - Server leitet's an OpenAI Whisper-1 weiter, mit Sprache 'de' als Hint
 *  - Returnt den Transkript-Text
 *
 * Kosten: $0.006 / Min Audio (~6 Cent / 10 Min).
 * Privacy: Audio geht für die Dauer der Transkription an OpenAI, wird laut
 *   OpenAI nicht für Training verwendet (Standard-API-Policy seit 2023).
 *   Für DSGVO-strict User → später Deepgram/AssemblyAI EU als Alternative.
 */
export async function POST(req: NextRequest) {
  // Auth-Check: nur eingeloggte User
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[transcribe] OPENAI_API_KEY missing in env')
    return NextResponse.json(
      { error: 'Transcription service not configured (OPENAI_API_KEY missing in env).' },
      { status: 503 }
    )
  }

  // Multipart-Body parsen
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }

  const audio = form.get('audio')
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'no audio file in form (field name: "audio")' }, { status: 400 })
  }

  // Size-Cap: Whisper-API erlaubt bis 25 MB. Wir cappen bei 20 MB für Headroom.
  const MAX_BYTES = 20 * 1024 * 1024
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({
      error: `Datei zu groß (${(audio.size / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB. Bei längeren Aufnahmen → kürzen oder als komprimiertes Format (.m4a, .mp3) statt .wav.`,
    }, { status: 413 })
  }

  // Sprache-Hint: Frontend kann via form-field 'lang' überschreiben, sonst 'de'
  const lang = (form.get('lang') as string | null)?.trim() || 'de'

  // Direkt an Whisper schicken — kein SDK damit wir keine Extra-Dependency haben
  const upstream = new FormData()
  upstream.append('file', audio, audio.name || 'audio.webm')
  upstream.append('model', 'whisper-1')
  upstream.append('language', lang)
  upstream.append('response_format', 'json')
  // Optional: 'prompt' für domain-spezifische Vokabular-Bias (Coaching-Begriffe etc.)
  upstream.append('prompt', 'Coaching-Gespräch auf Deutsch. Mögliche Begriffe: Coach, Profil, Memory, Bewerbungen, Führung, Team, Konflikt, Wert, Identität.')

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[transcribe] OpenAI Whisper failed', res.status, errBody)
      return NextResponse.json(
        { error: `Transcription failed (${res.status})` },
        { status: 502 }
      )
    }

    const data = (await res.json()) as { text?: string }
    const text = data.text?.trim() ?? ''
    if (!text) {
      return NextResponse.json({ error: 'Kein Text in der Aufnahme erkannt.' }, { status: 422 })
    }

    return NextResponse.json({ ok: true, text })
  } catch (e: unknown) {
    console.error('[transcribe] request failed', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'transcription failed' },
      { status: 500 }
    )
  }
}
