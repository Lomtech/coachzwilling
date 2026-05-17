import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { generateCoachProfile } from '@/lib/coach/profiler'
import { TOTAL_QUESTIONS, QUESTIONS } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Antworten kommen entweder direkt mit (Robustheit: falls Auto-Save nicht lief)
  // oder werden aus der DB geladen.
  const body = (await req.json().catch(() => null)) as
    | { answers?: Record<string, string> }
    | null

  // Letzte Response holen
  const { data: existing } = await supabase
    .from('questionnaire_responses')
    .select('id, answers, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let responseId: string | null = existing?.id ?? null
  let answers = (existing?.answers ?? {}) as Record<string, string>

  // Falls Client Antworten mitschickt: in DB persistieren (idempotent)
  if (body?.answers && Object.keys(body.answers).length > 0) {
    answers = body.answers
    if (existing?.id) {
      const { error } = await supabase
        .from('questionnaire_responses')
        .update({ answers: body.answers })
        .eq('id', existing.id)
      if (error) {
        console.error('[finalize] update failed', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { data: ins, error } = await supabase
        .from('questionnaire_responses')
        .insert({ user_id: user.id, answers: body.answers })
        .select('id')
        .single()
      if (error || !ins) {
        console.error('[finalize] insert failed', error)
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
      { error: `Es fehlen noch ${TOTAL_QUESTIONS - answeredCount} Antworten.` },
      { status: 400 }
    )
  }

  // Profile-Generation via Claude Opus
  const result = await generateCoachProfile(answers)

  // Speichern via Service-Client (bypassed RLS für insert in coach_profiles —
  // RLS hat nur SELECT-Policy, INSERT muss vom Backend kommen)
  const supa = serviceClient()

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
      source_response_id: responseId,
      config_md: result.configMd,
      model: result.model,
      is_active: true,
    })
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  await Promise.all([
    supa.from('questionnaire_responses')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', responseId),
    supa.from('profiles')
      .update({ onboarding_state: 'profiled' })
      .eq('id', user.id),
  ])

  return NextResponse.json({
    ok: true,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  })
}
