import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'

export default async function OnboardingStartPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  await supabase.from('profiles')
    .update({ onboarding_state: 'questionnaire' })
    .eq('id', user.id)

  return <QuestionnaireFlow initialAnswers={{}} initialIndex={0} />
}
