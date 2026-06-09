import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribe, isSttEnabled } from '@/lib/stt/client'

// ─────────────────────────────────────────────────────────────────────────────
// /api/transcribe — Whisper-Fallback für Browser ohne (oder ohne aktivierte)
// Web Speech API. Client schickt Audio (multipart/form-data), Server ruft
// den konfigurierten STT-Provider (default: OpenAI Whisper).
//
// Auth-Gate: nur eingeloggte User. Sonst wird das ein offener Whisper-Proxy
// und ein Kostentreiber.
//
// KEIN Coach-Gate (active/trialing Subscription): Spracheingabe kann auch
// während des Onboardings nützlich sein, und der gesamte Auth-flow blockiert
// Anonyme schon davor.
//
// GET liefert nur Status-Info — das nutzt der Client, um beim Mount zu
// entscheiden, ob der Whisper-Button angeboten wird.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB — OpenAI-Limit, knapp gehalten

export async function GET() {
  return NextResponse.json({ enabled: isSttEnabled() })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!isSttEnabled()) {
    return NextResponse.json(
      { error: 'Whisper-Fallback ist auf diesem Deployment nicht konfiguriert.' },
      { status: 503 },
    )
  }

  // multipart parsen
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'multipart/form-data erwartet' }, { status: 400 })
  }

  // FormDataEntryValue ist `string | File` laut Spec, aber Next.js Node-Runtime
  // löst `File` evtl. nicht im Typesystem auf — wir prüfen über Blob-Eigenschaften.
  const raw = form.get('audio')
  if (!raw || typeof raw === 'string' || !(raw instanceof Blob)) {
    return NextResponse.json({ error: 'Feld "audio" fehlt' }, { status: 400 })
  }
  const file = raw
  if (file.size === 0) {
    return NextResponse.json({ error: 'Audio leer' }, { status: 400 })
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: `Audio zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB, max 25 MB)` },
      { status: 413 },
    )
  }

  // Duck-Type für File (hat `name`) — vermeidet `instanceof File` weil das
  // im Next-Node-Runtime nicht stabil aufgelöst ist.
  const maybeFile = file as Blob & { name?: string }
  const rawFilename = maybeFile.name ?? 'audio.webm'
  // Sehr defensive Filename-Sanitization — Whisper akzeptiert fast alles, aber
  // wir wollen keine Path-Traversal-Hinweise in Logs.
  const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'audio.webm'
  const language = (form.get('language') as string | null) ?? 'de'

  try {
    const result = await transcribe({
      audio: file,
      filename,
      language: language || undefined,
      // Coaching-Kontext als Prompt — verbessert die Erkennung von
      // domain-spezifischen Wörtern wie "Coaching-Zwilling", "Denkhorizonte"
      // ohne dass der User die explizit aussprechen muss.
      prompt: 'Coaching-Zwilling Sitzung, deutsche Reflexion über Führung, Stress, Selbstbild, Motivation.',
    })
    return NextResponse.json({
      text: result.text,
      model: result.model,
      durationSec: result.durationSec ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'transcription failed'
    // Provider-Fehler loggen, aber im Response nur generisch — sonst leakt der
    // Status-Code interne Provider-Details.
    console.error('[transcribe] provider error', e)
    return NextResponse.json({ error: `Transkription fehlgeschlagen: ${msg}` }, { status: 502 })
  }
}
