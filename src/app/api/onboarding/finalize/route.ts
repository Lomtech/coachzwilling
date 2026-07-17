import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { streamMiniCoachProfile, streamFullCoachProfileV51 } from '@/lib/coach/profiler'
import { notifyAdminsNewProfile } from '@/lib/email/admin-notify'
import { sendUserProfileReady } from '@/lib/email/user-notify'
import { QUESTIONS, TOTAL_QUESTIONS, TOTAL_TEIL1, questionsForPart } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding-Finalize — SSE-Stream, zwei-stufig
//
// part 1 (Default): kostenloser Teil-1-Scan (22 Fragen) → Mini-Auswertung V1 →
//   coach_profiles tier='mini' (A-Mini + B-Mini) → Gratis-Chat + Mini-Doc.
// part 2: Teil 2 nach Kauf (alle 50 Antworten) → Voll-Auswertung V5.1 →
//   coach_profiles tier='full' (deaktiviert das Mini) → stiller Swap auf V4.1.
//
// SSE, damit die Vercel-Function während der Generierung durch fließende Bytes
// aktiv bleibt (sonst Timeout). Das Persistieren läuft immer zu Ende (auch bei
// Client-Disconnect); profiles.onboarding_state='processing' erlaubt Polling.
// ─────────────────────────────────────────────────────────────────────────────

interface FinalizeBody {
  answers?: Record<string, string>
  followupOptIn?: boolean
  /** 1 = Teil-1-Scan (22 → Mini-Profil, Default). 2 = Teil 2 nach Kauf (alle 50 → Vollprofil). */
  part?: 1 | 2
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as FinalizeBody | null
  const part: 1 | 2 = body?.part === 2 ? 2 : 1

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
    // Teil 2 ERGÄNZT die Teil-1-Antworten (Merge), Teil 1 setzt sie frisch.
    answers = part === 2 ? { ...answers, ...body.answers } : body.answers
    if (existing?.id) {
      const { error } = await supabase
        .from('questionnaire_responses')
        .update({ answers })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data: ins, error } = await supabase
        .from('questionnaire_responses')
        .insert({ user_id: user.id, answers })
        .select('id')
        .single()
      if (error || !ins) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
      responseId = ins.id
    }
  }

  if (!responseId) {
    return NextResponse.json({ error: 'kein Fragebogen gefunden' }, { status: 400 })
  }

  // Vollständigkeit je Teil: Teil 1 verlangt die 22 Teil-1-Fragen, Teil 2 alle 50.
  const requiredQuestions = part === 2 ? QUESTIONS : questionsForPart(1)
  const requiredTotal = part === 2 ? TOTAL_QUESTIONS : TOTAL_TEIL1
  const answeredCount = requiredQuestions.filter(q => Boolean(answers[String(q.id)])).length
  if (answeredCount < requiredTotal) {
    return NextResponse.json(
      { error: `Es fehlen noch ${requiredTotal - answeredCount} von ${requiredTotal} Antworten.` },
      { status: 400 },
    )
  }

  const supa = serviceClient()

  // Teil 2 verlangt den 149-€-Kauf (full_unlocked) — Defense-in-depth zusätzlich
  // zum UI-Gate. Bestandsnutzer (grandfathered) dürfen ebenfalls durch.
  let miniContinuity: string | undefined
  if (part === 2) {
    const { data: prof } = await supa
      .from('profiles')
      .select('full_unlocked, grandfathered')
      .eq('id', user.id)
      .maybeSingle()
    if (!prof?.full_unlocked && !prof?.grandfathered) {
      return NextResponse.json({ error: 'Teil 2 ist noch nicht freigeschaltet.' }, { status: 402 })
    }

    // Mini-Kontinuität: A-Mini (M1–M3, vor dem ersten "---") aus dem aktiven
    // Mini-Profil beilegen, damit das Vollprofil die Vorschau vertieft statt sie
    // zu widerlegen (Erkennungseffekt).
    const { data: mini } = await supa
      .from('coach_profiles')
      .select('config_md')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('tier', 'mini')
      .maybeSingle()
    if (mini?.config_md) {
      miniContinuity = mini.config_md.split(/\n---\n/)[0].trim() || undefined
    }
  }

  // State auf 'processing' — Polling-Endpoint erkennt das bei SSE-Abriss.
  await supa.from('profiles').update({ onboarding_state: 'processing' }).eq('id', user.id)

  const responseIdSafe = responseId
  const followupOptIn = body?.followupOptIn === true
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sse = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller könnte geschlossen sein (Client-Disconnect) — die
          // DB-Persistenz unten läuft trotzdem zu Ende.
        }
      }

      sse('start', { ok: true, part })

      try {
        let lastPing = Date.now()
        const onChunk = (_chunk: string, totalSoFar: number) => {
          const now = Date.now()
          if (now - lastPing >= 400) { sse('progress', { chars: totalSoFar }); lastPing = now }
        }

        const result = part === 2
          ? await streamFullCoachProfileV51(answers, onChunk, { miniContinuity })
          : await streamMiniCoachProfile(answers, onChunk)

        // Alte aktive Profile deaktivieren. Bei Teil 2 ist das der stille
        // Mini→Full-Swap: ab jetzt lädt der Chat das Vollprofil (V4.1).
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
            tier: part === 2 ? 'full' : 'mini',
          })

        if (insErr) {
          await supa.from('profiles').update({ onboarding_state: 'failed' }).eq('id', user.id)
          sse('error', { message: insErr.message })
          controller.close()
          return
        }

        const profileUpdate: { onboarding_state: string; followup_enabled?: boolean } = {
          onboarding_state: 'profiled',
        }
        if (followupOptIn) profileUpdate.followup_enabled = true

        const nowIso = new Date().toISOString()
        const stamp = part === 2
          ? { part2_completed_at: nowIso, completed_at: nowIso }
          : { part1_completed_at: nowIso }

        await Promise.all([
          supa.from('questionnaire_responses').update(stamp).eq('id', responseIdSafe),
          supa.from('profiles').update(profileUpdate).eq('id', user.id),
        ])

        // Benachrichtigungen (best-effort, blockieren nie den Abschluss):
        //  1) NUTZER bekommt sein (Kurz- bzw. Voll-)Profil verlinkt (/mein-profil).
        //  2) Betreiber (Lom/Michael) erfahren vom neuen Profil.
        try {
          const { data: p } = await supa
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .maybeSingle()
          const name = p?.full_name ?? null
          const email = p?.email ?? user.email ?? null
          const results = await Promise.allSettled([
            email ? sendUserProfileReady({ email, name, userId: user.id }) : Promise.resolve(),
            notifyAdminsNewProfile({ name, email: email ?? 'unbekannt', userId: user.id }),
          ])
          results.forEach(r => {
            if (r.status === 'rejected') console.error('[finalize] notify failed (ignored)', r.reason)
          })
        } catch (notifyErr) {
          console.error('[finalize] notify block failed (ignored)', notifyErr)
        }

        sse('done', {
          ok: true,
          part,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        })
        controller.close()
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'profiler failed'
        console.error('[finalize] stream failed', e)
        try {
          await supa.from('profiles').update({ onboarding_state: 'failed' }).eq('id', user.id)
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
