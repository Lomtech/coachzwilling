import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { answers?: Record<string, string> } | null
  if (!body?.answers) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  // Upsert: aktuelle in-progress response
  const { data: existing } = await supabase
    .from('questionnaire_responses')
    .select('id')
    .eq('user_id', user.id)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('questionnaire_responses')
      .update({ answers: body.answers })
      .eq('id', existing.id)
    if (error) {
      console.error('[onboarding/save] update failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('questionnaire_responses')
      .insert({ user_id: user.id, answers: body.answers })
    if (error) {
      console.error('[onboarding/save] insert failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
