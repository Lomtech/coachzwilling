import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuestionnaireFlow } from '@/components/onboarding/QuestionnaireFlow'
import { questionsForPart, TOTAL_TEIL1, TOTAL_QUESTIONS } from '@/data/questionnaire'
import { UnlockCodeForm } from '@/components/billing/UnlockCodeForm'
import { CheckoutButton } from '@/components/billing/CheckoutButton'

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

  // Kein Profil, aber bereits freigeschaltet (Firmencode oder Kauf VOR dem
  // Fragebogen) → alle 50 Fragen am Stück, direkt aufs Vollprofil. Kein
  // Kurzprofil-Zwischenstopp, auf den hier niemand warten will.
  if (fullUnlocked) {
    return (
      <QuestionnaireFlow
        initialAnswers={answers}
        initialIndex={computeStartIndexAll(answers)}
        part="all"
      />
    )
  }

  // Kein Profil, nichts freigeschaltet, noch nichts angefangen → Auswahl.
  const initialIndex = computeStartIndex(answers, 1)
  if (initialIndex === 0 && Object.keys(answers).length === 0) {
    return <StartChoice />
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

/**
 * Resume-Index für den Volltest am Stück: Teil 1 → Vertiefung → Teil 2.
 * Die Schrittfolge muss exakt der in QuestionnaireFlow (part='all') entsprechen.
 */
function computeStartIndexAll(answers: Record<string, string>): number {
  const t1 = questionsForPart(1)
  for (let i = 0; i < t1.length; i++) {
    if (!answers[String(t1[i].id)]) return i
  }
  // Teil 1 durch → Vertiefung ist Schritt t1.length.
  const vertiefungDone = ((answers['4'] ?? '').split(/\s*\|\s*/)[1] ?? '').trim().length > 0
  if (!vertiefungDone) return t1.length

  const t2 = questionsForPart(2)
  for (let i = 0; i < t2.length; i++) {
    if (!answers[String(t2[i].id)]) return t1.length + 1 + i
  }
  return t1.length + t2.length // letzter Schritt
}

/**
 * Einstiegs-Auswahl: kostenloser Kurztest ODER volle Analyse (Zugangscode oder
 * Karte). Wer hier freischaltet, läuft danach alle 50 Fragen am Stück durch —
 * ohne Kurzprofil-Zwischenstopp (siehe Routing oben, part='all').
 *
 * Der Upgrade-Weg NACH dem Kurzprofil (/billing) bleibt zusätzlich bestehen —
 * wer sich erst später entscheidet, verliert nichts.
 */
function StartChoice() {
  return (
    <main className="min-h-dvh flex flex-col px-5 max-w-xl w-full mx-auto">
      <header className="py-4">
        <a href="/" className="font-semibold text-lg tracking-tight">
          Deepling
        </a>
      </header>
      <div className="flex-1 py-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">
          Wie möchtest du starten?
        </h1>
        <p className="text-[var(--color-ink-2)] mb-8">
          Beide Wege führen zu deinem Deepling. Vom Kurztest kannst du später
          jederzeit auf die vollständige Analyse wechseln.
        </p>

        {/* 1 — Kostenloser Kurztest */}
        <div className="card mb-5">
          <div className="chip mb-3">Kostenlos</div>
          <h2 className="text-xl font-semibold tracking-tight mb-2">Kurztest</h2>
          <p className="text-sm text-[var(--color-ink-2)] mb-4">
            {TOTAL_TEIL1} Fragen, ca. 10 Minuten. Danach bekommst du sofort dein
            persönliches Kurz-Profil und kannst mit deinem Deepling sprechen.
          </p>
          <ul className="space-y-1.5 text-sm text-[var(--color-ink-2)] mb-5">
            <li>• zwei Kernmuster + dein blinder Fleck</li>
            <li>• eine Frage nach der anderen — kein Kommentar, keine Bewertung</li>
            <li>• du kannst pausieren, wir speichern automatisch</li>
          </ul>
          <a href="/onboarding/start" className="btn btn-primary btn-block">
            Kurztest starten — kostenlos
          </a>
        </div>

        {/* 2 — Vollständige Analyse (Code oder Karte) */}
        <div className="card">
          <div className="chip mb-3">Vollständig</div>
          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Vollständige Analyse
          </h2>
          <p className="text-sm text-[var(--color-ink-2)] mb-4">
            Alle {TOTAL_QUESTIONS} Fragen am Stück, ca. 25 Minuten. Dein
            vollständiges Rohprofil — und ein Coach, der vollständig auf dich
            kalibriert ist.
          </p>
          <ul className="space-y-1.5 text-sm text-[var(--color-ink-2)] mb-5">
            <li>• alles aus dem Kurztest</li>
            <li>• Vier-Felder-Stärkenprofil + deine Schatten</li>
            <li>• Entscheidungsleck + 90-Tage-Orientierung</li>
          </ul>

          <UnlockCodeForm
            isLoggedIn
            defaultOpen
            hint="Du hast einen Zugangscode — von deinem Unternehmen oder deinem Coach? Hier einlösen:"
          />

          <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-muted)]">
            <span className="flex-1 h-px bg-[var(--color-line)]" />
            oder
            <span className="flex-1 h-px bg-[var(--color-line)]" />
          </div>

          <CheckoutButton
            plan="full"
            ctaText="Mit Karte freischalten — 149 €"
            nextPath="/onboarding"
          />
          <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
            Einmalig · kein Abo · sichere Zahlung über Stripe.
          </p>
        </div>
      </div>
    </main>
  )
}
