import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'
import { QUESTIONS } from '@/data/questionnaire'

export const dynamic = 'force-dynamic'

/**
 * Fehlende Fragen nachtragen — für Bestandsnutzer.
 *
 * Der Fragebogen wurde nachträglich von 42 auf 50 Fragen erweitert. Wer vorher
 * onboardet hat, dem fehlen die IDs 43–50 (Coach-Präferenzen + Kontext). Hier
 * beantwortet er NUR diese Lücke; danach wird das Vollprofil aus allen 50
 * Antworten neu erzeugt und ersetzt das alte (stiller Swap). Der Chatverlauf
 * bleibt vollständig erhalten — niemand muss von vorn anfangen.
 */
export default async function ErgaenzenPage({
  searchParams,
}: {
  searchParams: Promise<{ los?: string }>
}) {
  const { los } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/onboarding/ergaenzen')

  const { data: existing } = await supabase
    .from('questionnaire_responses')
    .select('answers')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const answers = (existing?.answers as Record<string, string> | undefined) ?? {}
  const fehlend = QUESTIONS.filter(q => !answers[String(q.id)])

  // Wer noch gar nicht angefangen hat, gehört ins normale Onboarding.
  if (Object.keys(answers).length === 0) redirect('/onboarding')
  // Nichts zu ergänzen → nichts zu tun.
  if (fehlend.length === 0) redirect('/coach')

  if (los === '1') {
    return <QuestionnaireFlow initialAnswers={answers} initialIndex={0} part="rest" />
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 max-w-xl w-full mx-auto">
      <header className="py-4">
        <Link href="/coach" className="font-semibold text-lg tracking-tight">Deepling</Link>
      </header>
      <div className="flex-1 py-8">
        <div className="chip mb-4">Profil vervollständigen</div>
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          {fehlend.length} {fehlend.length === 1 ? 'Frage fehlt' : 'Fragen fehlen'} noch.
        </h1>
        <p className="text-[var(--color-ink-2)] mb-6">
          Dein Fragebogen ist damals kürzer gewesen. Diese {fehlend.length} Fragen sind
          später dazugekommen — sie schärfen vor allem, <strong>wie</strong> dein Coach mit dir
          umgehen soll.
        </p>
        <ul className="space-y-2 text-sm text-[var(--color-ink-2)]">
          <li>• Dauer: ca. {Math.max(2, Math.round(fehlend.length * 0.5))} Minuten</li>
          <li>• Du beantwortest <strong>nur</strong> die fehlenden Fragen — nichts doppelt</li>
          <li>• Danach wird dein Profil aus allen {QUESTIONS.length} Antworten neu erstellt</li>
          <li>• Dein bisheriger Chatverlauf bleibt vollständig erhalten</li>
        </ul>
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/onboarding/ergaenzen?los=1" className="btn btn-primary btn-block">
            Fehlende Fragen beantworten
          </Link>
          <Link href="/coach" className="btn btn-ghost btn-block">Später</Link>
        </div>
      </div>
    </main>
  )
}
