import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/types/database'
import { LogoMark } from '@/components/Logo'
import { CheckoutButton } from './CheckoutButton'
import { ManageButton } from './ManageButton'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Billing deaktiviert? → Aktuell-kostenlos-Page
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true') {
    return (
      <main className="min-h-dvh px-5 py-6 max-w-2xl w-full mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-lg">Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling</span>
          </Link>
          {user ? (
            <Link href="/settings" className="btn btn-ghost">Konto</Link>
          ) : (
            <Link href="/login" className="btn btn-ghost">Login</Link>
          )}
        </header>
        <div className="card text-center py-10">
          <div className="text-5xl mb-4">🎁</div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3">Aktuell kostenlos</h1>
          <p className="text-[var(--color-ink-2)] mb-6 max-w-md mx-auto">
            Wir sind in der offenen Testphase. Du kannst den Coach komplett kostenlos nutzen —
            ohne Karte, ohne Limit.
          </p>
          <Link
            href={user ? '/coach' : '/signup'}
            className="btn btn-primary"
          >
            {user ? 'Zum Coach' : 'Jetzt starten — kostenlos'}
          </Link>
        </div>
      </main>
    )
  }

  // Preise sind PUBLIC sichtbar. Sub-Status + Trial-Check nur wenn eingeloggt.
  let isActive = false
  let sub: { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null = null
  let demoAllowed = false
  let trialUntil: string | null = null
  let trialDaysLeft = 0

  if (user) {
    const [{ data: subData }, { data: profileData }] = await Promise.all([
      supabase.from('subscriptions').select('status, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('trial_until').eq('id', user.id).maybeSingle(),
    ])
    sub = subData
    isActive = !!sub && ACTIVE_STATUSES.has(sub.status)
    trialUntil = profileData?.trial_until ?? null
    if (trialUntil) {
      const ms = new Date(trialUntil).getTime() - Date.now()
      trialDaysLeft = Math.max(0, Math.ceil(ms / 86_400_000))
    }

    const demoEmailList = (process.env.DEMO_USER_EMAILS ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    demoAllowed =
      process.env.DEMO_MODE === 'true' &&
      typeof user.email === 'string' &&
      demoEmailList.includes(user.email.toLowerCase())
  }
  const trialActive = trialDaysLeft > 0

  return (
    <main className="min-h-dvh px-5 py-6 max-w-2xl w-full mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight flex items-center gap-2.5">
          <LogoMark size={26} />
          <span className="text-lg">Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling</span>
        </Link>
        {user ? (
          <Link href="/settings" className="btn btn-ghost">Konto</Link>
        ) : (
          <Link href="/login?next=/billing" className="btn btn-ghost">Login</Link>
        )}
      </header>

      {/* Trial-Banner wenn aktiver Trial ohne Sub */}
      {user && trialActive && !isActive && (
        <div className="card mb-6 bg-[var(--color-accent-soft)] border-[var(--color-accent)]/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🎁</span>
            <div>
              <div className="font-semibold text-[var(--color-ink)] mb-1">
                Du hast noch {trialDaysLeft} {trialDaysLeft === 1 ? 'Tag' : 'Tage'} gratis
              </div>
              <p className="text-sm text-[var(--color-ink-2)]">
                Volle Funktionalität bis {new Date(trialUntil!).toLocaleDateString('de-DE')}.
                Danach geht es nur mit einem Abo weiter — wähle jetzt deinen Plan oder warte
                bis zum Ende der Probezeit.
              </p>
            </div>
          </div>
        </div>
      )}

      {isActive && sub ? (
        <ActiveCard
          status={sub.status}
          periodEnd={sub.current_period_end}
          cancelAtPeriodEnd={sub.cancel_at_period_end}
        />
      ) : (
        <ChooseTier showTestPlan={demoAllowed} isLoggedIn={!!user} />
      )}
    </main>
  )
}

function ChooseTier({ showTestPlan, isLoggedIn }: { showTestPlan: boolean; isLoggedIn: boolean }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        {isLoggedIn ? 'Plan wählen' : 'Preise'}
      </h1>
      <p className="text-[var(--color-ink-2)] mb-7">
        7 Tage kostenlos. Karte wird in der Probezeit nicht belastet — jederzeit kündbar.
      </p>

      {!isLoggedIn && (
        <div className="mb-6 card bg-[var(--color-accent-soft)] border-[var(--color-accent)] border-opacity-30">
          <p className="text-sm text-[var(--color-ink)]">
            <strong>Du brauchst ein Profil, um zu starten.</strong> Bei einem Klick auf einen Plan
            legen wir zuerst dein Konto an — das geht in 30 Sekunden.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <PlanCard
          plan="yearly"
          label="Jährlich"
          price="19 €"
          subPrice="228 € pro Jahr"
          period="/ Monat"
          save="Spart 120 € gegenüber monatlich"
          trial="7 Tage gratis"
          cta={isLoggedIn ? 'Jährlich starten →' : 'Profil anlegen & jährlich →'}
          highlight
          isLoggedIn={isLoggedIn}
        />
        <PlanCard
          plan="monthly"
          label="Monatlich"
          price="29 €"
          period="/ Monat"
          trial="7 Tage gratis"
          cta={isLoggedIn ? 'Monatlich starten →' : 'Profil anlegen & monatlich →'}
          isLoggedIn={isLoggedIn}
        />
        {showTestPlan && (
          <PlanCard
            plan="test"
            label="🧪 E2E-Test (intern)"
            price="1 €"
            period="/ Monat"
            badge="Nur sichtbar für Demo-Accounts"
            note="Kein Trial — sofortige 1 €-Belastung zur Verifizierung des Webhook-Pfades. Jederzeit refundbar."
            cta="Test-Charge 1 € starten →"
            test
            isLoggedIn={isLoggedIn}
          />
        )}
      </div>

      <div className="mt-6 text-xs text-[var(--color-muted)] text-center">
        Sichere Zahlung via <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">Stripe</a> ·
        Karte, SEPA, Apple Pay & Google Pay
      </div>
    </>
  )
}

function PlanCard({
  plan, label, price, subPrice, period, save, trial, note, badge, cta, highlight = false, test = false, isLoggedIn = true,
}: {
  plan: 'monthly' | 'yearly' | 'test'
  label: string
  price: string
  subPrice?: string
  period: string
  save?: string
  trial?: string
  note?: string
  badge?: string
  cta: string
  highlight?: boolean
  test?: boolean
  isLoggedIn?: boolean
}) {
  const cardClass = test
    ? 'border-2 border-dashed border-[var(--color-warning)] bg-[#fff8e6]'
    : highlight
    ? 'ring-2 ring-[var(--color-ink)]'
    : ''
  return (
    <div className={`card relative transition-all hover:shadow-md ${cardClass}`}>
      {highlight && !test && (
        <div className="absolute -top-3 left-4 chip" style={{ background: 'var(--color-ink)', color: 'white' }}>
          Empfohlen
        </div>
      )}
      {test && (
        <div className="absolute -top-3 left-4 chip" style={{ background: 'var(--color-warning)', color: 'white' }}>
          Internal
        </div>
      )}

      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider">{label}</div>
        {trial && !test && <span className="text-xs text-[var(--color-success)] font-semibold">{trial}</span>}
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <div className="text-4xl font-semibold tracking-tight">{price}</div>
        <div className="text-[var(--color-muted)]">{period}</div>
      </div>
      {subPrice && <div className="text-sm text-[var(--color-ink-2)] mb-1">{subPrice}</div>}
      {save && <div className="text-xs text-[var(--color-success)] font-semibold mb-3">✓ {save}</div>}
      {note && <div className="text-xs text-[var(--color-ink-2)] mb-3">{note}</div>}
      {badge && <div className="text-xs text-[var(--color-muted)] italic mb-3">{badge}</div>}

      <CheckoutButton plan={plan} ctaText={cta} isLoggedIn={isLoggedIn} />
    </div>
  )
}

function ActiveCard({
  status, periodEnd, cancelAtPeriodEnd,
}: { status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean }) {
  return (
    <div className="card">
      <div className="chip mb-3">{status === 'trialing' ? 'Probezeit aktiv' : 'Abo aktiv'}</div>
      <h2 className="text-2xl font-semibold tracking-tight mb-2">
        Du bist dabei.
      </h2>
      <p className="text-[var(--color-ink-2)]">
        {cancelAtPeriodEnd
          ? `Dein Abo läuft am ${formatDate(periodEnd)} aus.`
          : `Nächste Verlängerung: ${formatDate(periodEnd)}`}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href="/coach" className="btn btn-primary btn-block">Zum Coach</Link>
        <ManageButton />
      </div>
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
