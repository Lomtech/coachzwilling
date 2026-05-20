import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Re-Onboarding-Flow für bestehende User.
 *
 * Verhalten:
 * - Verwirft *unvollständige* Drafts (questionnaire_responses ohne completed_at)
 * - Setzt profiles.onboarding_state zurück auf 'pending', sodass /onboarding
 *   wieder aufrufbar wird (sonst redirected /onboarding zu /coach).
 * - Lässt das *aktive* coach_profile + Memory + abgeschlossene Responses
 *   unberührt — der User chattet weiter mit dem alten Coach, bis er den neuen
 *   Scan abschliesst. Bei finalize() wird das neue Profil aktiv geschaltet
 *   und das alte automatisch deaktiviert (siehe finalize/route.ts).
 *
 * Sicherheits-Check: nur eingeloggter User darf seinen eigenen Reset auslösen.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supa = serviceClient()

  // 1) Drafts (in-progress responses) löschen — sonst springt der User in einen
  //    halbfertigen alten Scan.
  const { error: delErr } = await supa
    .from('questionnaire_responses')
    .delete()
    .eq('user_id', user.id)
    .is('completed_at', null)
  if (delErr) {
    console.error('[onboarding/reset] draft delete failed', delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  // 2) onboarding_state zurücksetzen, damit /onboarding nicht zu /coach redirected.
  const { error: updErr } = await supa
    .from('profiles')
    .update({ onboarding_state: 'pending' })
    .eq('id', user.id)
  if (updErr) {
    console.error('[onboarding/reset] state reset failed', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
