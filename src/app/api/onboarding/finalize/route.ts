import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { streamCoachProfile } from '@/lib/coach/profiler'
import { TOTAL_QUESTIONS, QUESTIONS } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding-Finalize — SSE-Stream
//
// Frühere Version war ein synchroner POST: `await generateCoachProfile()` →
// 2-4 Min. Opus-Latenz → Vercel killt die Function nach maxDuration (war 120s)
// → FUNCTION_INVOCATION_TIMEOUT mitten im "Profil wird erstellt"-Spinner.
//
// Jetzt: SSE-Stream. Anthropic-Tokens werden chunkweise weitergereicht, der
// Server-Endpoint bleibt damit über die gesamte Generierungsdauer "aktiv"
// (Vercel cancelt streamende Functions nicht, solange Bytes fließen) und
// die UI kann Live-Fortschritt anzeigen statt nur weißen Spinner.
//
// Sicherheitsnetz: profiles.onboarding_state geht auf 'processing' → wenn der
// Client-Stream vorzeitig abreisst, kann er via GET /api/onboarding/status den
// Endzustand pollen — das eigentliche Persistieren des coach_profiles passiert
// IMMER (siehe finally-Block unten), unabhängig von der Stream-Verbindung.
// ─────────────────────────────────────────────────────────────────────────────

interface FinalizeBody {
  answers?: Record<string, string>
  followupOptIn?: boolean
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as FinalizeBody | null

  const { data: existing } = await supabase
    .from('questionnaire_responses')
    .select('id, answers, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let responseId: string | null = existing?.id ?? null
  let answers = (existing?.answers ?? {}) as Record<string, string>

  if (body?.answers && Object.keys(body.answers).length > 0) {
    answers = body.answers
    if (existing?.id) {
      const { error } = await supabase
        .from('questionnaire_responses')
        .update({ answers: body.answers })
        .eq('id', existing.id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { data: ins, error } = await supabase
        .from('questionnaire_responses')
        .insert({ user_id: user.id, answers: body.answers })
        .select('id')
        .single()
      if (error || !ins) {
        return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
      }
      responseId = ins.id
    }
  }

  if (!responseId) {
    return NextResponse.json({ error: 'kein Fragebogen gefunden' }, { status: 400 })
  }

  const answeredCount = QUESTIONS.filter(q => Boolean(answers[String(q.id)])).length
  if (answeredCount < TOTAL_QUESTIONS) {
    return NextResponse.json(
      { error: `Es fehlen noch ${TOTAL_QUESTIONS - answeredCount} von ${TOTAL_QUESTIONS} Antworten.` },
      { status: 400 }
    )
  }

  const supa = serviceClient()

  // State auf 'processing' setzen — Polling-Endpoint kann das erkennen falls
  // der SSE-Stream abreisst und der Client neu pollt.
  await supa
    .from('profiles')
    .update({ onboarding_state: 'processing' })
    .eq('id', user.id)

  const responseIdSafe = responseId
  const followupOptIn = body?.followupOptIn === true

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sse = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller könnte geschlossen sein (Client-Disconnect) — egal,
          // die DB-Persistenz unten läuft trotzdem zu Ende.
        }
      }

      sse('start', { ok: true })

      try {
        let lastPing = Date.now()
        const result = await streamCoachProfile(answers, (_chunk, totalSoFar) => {
          // Throttle: max alle 400ms ein progress event (UI braucht nicht
          // jeden Token, und SSE-Overhead bleibt vernachlässigbar).
          const now = Date.now()
          if (now - lastPing >= 400) {
            sse('progress', { chars: totalSoFar })
            lastPing = now
          }
        })

        // Alte aktive Profile deaktivieren (idempotent — falls Re-Run)
        await supa
          .from('coach_profiles')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true)

        const { error: insErr } = await supa
          .from('coach_profiles')
          .insert({
            user_id: user.id,
            source_response_id: responseIdSafe,
            tone_oneliner: result.toneOneliner,
            language_mirror: result.languageMirror,
            config_md: result.configMd,
            model: result.model,
            is_active: true,
          })

        if (insErr) {
          await supa.from('profiles')
            .update({ onboarding_state: 'failed' })
            .eq('id', user.id)
          sse('error', { message: insErr.message })
          controller.close()
          return
        }

        const profileUpdate: { onboarding_state: string; followup_enabled?: boolean } = {
          onboarding_state: 'profiled',
        }
        if (followupOptIn) profileUpdate.followup_enabled = true

        await Promise.all([
          supa.from('questionnaire_responses')
            .update({ completed_at: new Date().toISOString() })
            .eq('id', responseIdSafe),
          supa.from('profiles')
            .update(profileUpdate)
            .eq('id', user.id),
        ])

        sse('done', {
          ok: true,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        })
        controller.close()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'profiler failed'
        console.error('[finalize] stream failed', e)
        // State auf 'failed' — Client kann via /status checken und retry anbieten
        try {
          await supa.from('profiles')
            .update({ onboarding_state: 'failed' })
            .eq('id', user.id)
        } catch { /* best-effort */ }
        sse('error', { message })
        try { controller.close() } catch {}
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
