import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'

export default async function OnboardingStartPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  // DEFENSIVE: nicht stumpf auf 'questionnaire' setzen.
  // Wenn der User bereits ein aktives Coach-Profil hat, entscheidet /onboarding
  // (Teil 2 falls 149 € gezahlt, sonst Gratis-Chat) — hier NICHT den State
  // zurücksetzen. Re-Onboarding läuft über /api/onboarding/reset.
  const { data: existingProfile } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingProfile) {
    redirect('/onboarding')
  }

  await supabase.from('profiles')
    .update({ onboarding_state: 'questionnaire' })
    .eq('id', user.id)

  // Frischer Start = Teil 1 (kostenloser 22-Fragen-Scan).
  return <QuestionnaireFlow initialAnswers={{}} initialIndex={0} part={1} />
}
