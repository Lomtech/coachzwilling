import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'
import { QUESTIONS, SECTIONS, TOTAL_QUESTIONS } from '@/data/questionnaire'
import { SCAN_INTRO } from '@/lib/coach/prompts'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  // Profil schon fertig? → ab zum Coach
  const { data: profile } = await supabase
    .from('profiles').select('onboarding_state').eq('id', user.id).maybeSingle()
  if (profile?.onboarding_state === 'profiled' || profile?.onboarding_state === 'active') {
    redirect('/coach')
  }

  // Bestehende Antworten laden (laufender Scan)
  const { data: existing } = await supabase
    .from('questionnaire_responses')
    .select('id, answers, completed_at')
    .eq('user_id', user.id)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialAnswers = (existing?.answers as Record<string, string>) ?? {}
  const initialIndex = computeStartIndex(initialAnswers)

  if (initialIndex === 0 && Object.keys(initialAnswers).length === 0) {
    return <Intro />
  }

  return <QuestionnaireFlow initialAnswers={initialAnswers} initialIndex={initialIndex} />
}

function computeStartIndex(answers: Record<string, string>): number {
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    if (!answers[String(QUESTIONS[i].id)]) return i
  }
  return TOTAL_QUESTIONS - 1
}

function Intro() {
  return (
    <main className="min-h-dvh flex flex-col px-5 max-w-xl w-full mx-auto">
      <header className="py-4">
        <a href="/" className="font-semibold text-lg tracking-tight">
          Deepling
        </a>
      </header>
      <div className="flex-1 py-8">
        <div className="chip mb-4">Scan-Modus</div>
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          {TOTAL_QUESTIONS} Fragen. Eine nach der anderen.
        </h1>
        <p className="text-[var(--color-ink-2)] mb-6 whitespace-pre-line">
          {SCAN_INTRO}
        </p>
        <ul className="space-y-2 text-sm text-[var(--color-ink-2)]">
          <li>• Dauer: 15–20 Minuten</li>
          <li>• Du kannst pausieren — wir speichern automatisch</li>
          <li>• {SECTIONS.length} Themenbereiche, vom Persönlichen bis zum Kontext</li>
        </ul>
        <div className="mt-8">
          <a
            href="/onboarding/start"
            className="btn btn-primary btn-block"
          >
            Los geht's
          </a>
        </div>
      </div>
    </main>
  )
}
