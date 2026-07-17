import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'
import { questionsForPart, TOTAL_TEIL1 } from '@/data/questionnaire'
import { SCAN_INTRO } from '@/lib/coach/prompts'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding')

  const [{ data: profile }, { data: activeProfile }, { data: existing }] = await Promise.all([
    supabase.from('profiles').select('full_unlocked').eq('id', user.id).maybeSingle(),
    supabase
      .from('coach_profiles')
      .select('tier')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('questionnaire_responses')
      .select('answers')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const tier = activeProfile?.tier
  const fullUnlocked = profile?.full_unlocked === true
  const answers = (existing?.answers as Record<string, string> | undefined) ?? {}

  // Vollprofil existiert (Teil 2 fertig) → fertig, ab zum Coach.
  if (tier === 'full') redirect('/coach')

  // Mini-Profil vorhanden = Teil 1 erledigt.
  if (tier === 'mini') {
    if (fullUnlocked) {
      // 149 € gezahlt → Teil 2 (Vertiefungs-Einstieg + 28 Fragen).
      return (
        <QuestionnaireFlow
          initialAnswers={answers}
          initialIndex={computeStartIndex(answers, 2)}
          part={2}
        />
      )
    }
    // Noch nicht gekauft → nichts mehr zu tun, ab in den Gratis-Chat.
    redirect('/coach')
  }

  // Kein Profil → Teil 1 (kostenloser Scan).
  const initialIndex = computeStartIndex(answers, 1)
  if (initialIndex === 0 && Object.keys(answers).length === 0) {
    return <Intro />
  }
  return <QuestionnaireFlow initialAnswers={answers} initialIndex={initialIndex} part={1} />
}

/** Erster unbeantworteter Schritt des jeweiligen Teils (für Resume). */
function computeStartIndex(answers: Record<string, string>, part: 1 | 2): number {
  if (part === 2) {
    // Schritt 0 = Vertiefung (Nachfrage-Teil von answers["4"] = "main | vertiefung").
    const vertiefungDone = ((answers['4'] ?? '').split(/\s*\|\s*/)[1] ?? '').trim().length > 0
    if (!vertiefungDone) return 0
    const qs = questionsForPart(2)
    for (let i = 0; i < qs.length; i++) {
      if (!answers[String(qs[i].id)]) return i + 1 // +1: Vertiefung ist Schritt 0
    }
    return qs.length
  }
  const qs = questionsForPart(1)
  for (let i = 0; i < qs.length; i++) {
    if (!answers[String(qs[i].id)]) return i
  }
  return qs.length - 1
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
          {TOTAL_TEIL1} Fragen. Eine nach der anderen.
        </h1>
        <p className="text-[var(--color-ink-2)] mb-6 whitespace-pre-line">
          {SCAN_INTRO}
        </p>
        <ul className="space-y-2 text-sm text-[var(--color-ink-2)]">
          <li>• Dauer: ca. 10 Minuten</li>
          <li>• Du kannst pausieren — wir speichern automatisch</li>
          <li>• Danach bekommst du sofort dein persönliches Kurz-Profil</li>
        </ul>
        <div className="mt-8">
          <a href="/onboarding/start" className="btn btn-primary btn-block">
            Los geht&apos;s
          </a>
        </div>
      </div>
    </main>
  )
}
