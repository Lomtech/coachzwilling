import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'

export default async function OnboardingStartPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  // DEFENSIVE: nicht stumpf auf 'questionnaire' setzen.
  // Wenn der User bereits ein aktives Coach-Profil hat (also bereits durch
  // ein Onboarding durch ist), darf er hier nicht aus Versehen seinen State
  // zurückgesetzt bekommen — sonst fliegt er aus dem Cron-Filter,
  // bekommt keine Follow-up-Mails mehr, der Coach-Gate könnte ihn rausschmeißen.
  // Re-Onboarding läuft über /api/onboarding/reset (setzt State explizit auf
  // 'pending' + räumt Drafts auf) — DAS ist der einzige saubere Pfad.
  const { data: existingProfile } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existingProfile) {
    // User hat schon ein Profil — soll lieber den Re-Onboarding-Button in
    // /settings nutzen wenn er wirklich neu starten will. Direkt zum Coach.
    redirect('/coach')
  }

  await supabase.from('profiles')
    .update({ onboarding_state: 'questionnaire' })
    .eq('id', user.id)

  return <QuestionnaireFlow initialAnswers={{}} initialIndex={0} />
}
