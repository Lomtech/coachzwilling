import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { generateCoachProfile } from '@/lib/coach/profiler'
import { TOTAL_QUESTIONS, QUESTIONS } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Letzte abgeschlossene Antwort holen
  const { data: response } = await supabase
    .from('questionnaire_responses')
    .select('id, answers, completed_at')
    .eq('user_id', user.id)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!response) {
    return NextResponse.json(
      { error: 'Kein abgeschlossener Fragebogen gefunden — bitte zuerst Onboarding machen.' },
      { status: 400 }
    )
  }

  const answers = (response.answers ?? {}) as Record<string, string>
  const answered = QUESTIONS.filter(q => Boolean(answers[String(q.id)])).length
  if (answered < TOTAL_QUESTIONS) {
    return NextResponse.json(
      { error: `Es fehlen ${TOTAL_QUESTIONS - answered} Antworten — Onboarding ist nicht vollständig.` },
      { status: 400 }
    )
  }

  // Profil regenerieren (verwendet aktuelle Version von PROFILER_PROMPT aus prompts.ts)
  const result = await generateCoachProfile(answers)

  const supa = serviceClient()

  // Alle bestehenden aktiven Profile deaktivieren (Historie bleibt erhalten)
  await supa
    .from('coach_profiles')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true)

  const { data: inserted, error: insErr } = await supa
    .from('coach_profiles')
    .insert({
      user_id: user.id,
      source_response_id: response.id,
      config_md: result.configMd,
      tone_oneliner: result.toneOneliner,
      language_mirror: result.languageMirror,
      model: result.model,
      is_active: true,
    })
    .select('id, generated_at, model')
    .single()

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message ?? 'insert failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    profileId: inserted.id,
    generatedAt: inserted.generated_at,
    model: inserted.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  })
}
