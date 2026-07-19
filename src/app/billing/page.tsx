import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/types/database'
import { LogoMark } from '@/components/Logo'
import { isAdminEmail } from '@/lib/admin-auth'
import { CheckoutButton } from './CheckoutButton'
import { ManageButton } from './ManageButton'
import { UnlockCodeForm } from './UnlockCodeForm'

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
            <span className="text-lg">Deepling</span>
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
  let fullUnlocked = false

  if (user) {
    const [{ data: subData }, { data: profileData }] = await Promise.all([
      supabase.from('subscriptions').select('status, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('trial_until, full_unlocked').eq('id', user.id).maybeSingle(),
    ])
    sub = subData
    isActive = !!sub && ACTIVE_STATUSES.has(sub.status)
    fullUnlocked = profileData?.full_unlocked === true
    trialUntil = profileData?.trial_until ?? null
    if (trialUntil) {
      const ms = new Date(trialUntil).getTime() - Date.now()
      trialDaysLeft = Math.max(0, Math.ceil(ms / 86_400_000))
    }

    // Test-Plan (1 €) nur für Admins sichtbar — interner Webhook-Test.
    demoAllowed = isAdminEmail(user.email)
  }
  // trialDaysLeft bleibt für interne Logik, wird aber NICHT mehr als
  // "X Tage gratis" angezeigt (Geschäftsmodell ist B2B-Direktverkauf).
  void trialDaysLeft

  return (
    <main className="min-h-dvh px-5 py-6 max-w-2xl w-full mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight flex items-center gap-2.5">
          <LogoMark size={26} />
          <span className="text-lg">Deepling</span>
        </Link>
        {user ? (
          <Link href="/settings" className="btn btn-ghost">Konto</Link>
        ) : (
          <Link href="/login?next=/billing" className="btn btn-ghost">Login</Link>
        )}
      </header>

      {isActive && sub ? (
        <ActiveCard
          status={sub.status}
          periodEnd={sub.current_period_end}
          cancelAtPeriodEnd={sub.cancel_at_period_end}
        />
      ) : fullUnlocked ? (
        <UnlockedCard />
      ) : (
        <>
          <FullUnlockCard isLoggedIn={!!user} />
          <div className="mt-10 pt-8 border-t border-[var(--color-line)]">
            <ChooseTier showTestPlan={demoAllowed} isLoggedIn={!!user} />
          </div>
        </>
      )}
    </main>
  )
}

function FullUnlockCard({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Dein vollständiges Rohprofil</h1>
      <p className="text-[var(--color-ink-2)] mb-7">
        Die Vorschau hat dir zwei Muster und einen blinden Fleck gezeigt. Das
        vollständige Rohprofil geht tiefer — und schaltet den zweiten Teil des
        Fragebogens frei, aus dem dein Deepling vollständig kalibriert wird.
      </p>
      <div className="card">
        <div className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
          Vollprofil freischalten
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <div className="text-4xl font-semibold tracking-tight">149 €</div>
          <div className="text-[var(--color-muted)]">einmalig</div>
        </div>
        <div className="text-xs text-[var(--color-success)] font-semibold mb-4">
          ✓ Einmalig · Sofortiger Zugang · Kein Abo
        </div>
        <ul className="space-y-2 text-sm text-[var(--color-ink-2)] mb-5">
          <li className="flex gap-2.5"><span className="text-[var(--color-accent)] shrink-0">•</span><span>dein persönliches Vier-Felder-Stärkenprofil</span></li>
          <li className="flex gap-2.5"><span className="text-[var(--color-accent)] shrink-0">•</span><span>deine individuellen Schatten — und was sie schützen</span></li>
          <li className="flex gap-2.5"><span className="text-[var(--color-accent)] shrink-0">•</span><span>dein Entscheidungsleck und deine 90-Tage-Orientierung</span></li>
          <li className="flex gap-2.5"><span className="text-[var(--color-accent)] shrink-0">•</span><span>der vertiefende zweite Fragebogen-Teil + voll kalibrierter Coach</span></li>
        </ul>
        <CheckoutButton plan="full" ctaText="Rohprofil freischalten — 149 €" isLoggedIn={isLoggedIn} />
        <p className="mt-3 text-center text-xs text-[var(--color-muted)]">Sichere Zahlung über Stripe.</p>
        <UnlockCodeForm isLoggedIn={isLoggedIn} />
      </div>
    </>
  )
}

function UnlockedCard() {
  return (
    <div className="card">
      <div className="chip mb-3">Freigeschaltet</div>
      <h2 className="text-2xl font-semibold tracking-tight mb-2">Dein Vollprofil ist freigeschaltet.</h2>
      <p className="text-[var(--color-ink-2)]">
        Mach jetzt den zweiten Teil des Fragebogens — danach erstellt dein Deepling
        dein vollständiges Rohprofil und kalibriert sich neu.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href="/onboarding" className="btn btn-primary btn-block">Weiter zu Teil 2 →</Link>
        <Link href="/coach" className="btn btn-ghost btn-block">Zum Coach</Link>
      </div>
    </div>
  )
}

function ChooseTier({ showTestPlan, isLoggedIn }: { showTestPlan: boolean; isLoggedIn: boolean }) {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Für Unternehmen</h1>
      <p className="text-[var(--color-ink-2)] mb-7">
        Deepling ist ein Coaching-Werkzeug für Führungskräfte — angeboten als
        Zugang für dein Team. Wir richten euch individuell ein: Anzahl der
        Plätze, Onboarding und Abrechnung stimmen wir direkt mit dir ab.
      </p>

      <div className="card space-y-5">
        <div>
          <h2 className="font-semibold text-[var(--color-ink)] text-lg mb-2">So läuft es ab</h2>
          <ul className="space-y-2.5 text-sm text-[var(--color-ink-2)]">
            <li className="flex gap-2.5">
              <span className="text-[var(--color-accent)] font-semibold shrink-0">1.</span>
              <span>Du sagst uns, wie viele Plätze du für dein Team brauchst.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-[var(--color-accent)] font-semibold shrink-0">2.</span>
              <span>Wir schicken dir einen Zugangscode, den du an deine Leute verteilst.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-[var(--color-accent)] font-semibold shrink-0">3.</span>
              <span>Jede Person legt in 30 Sekunden ein Konto an und startet sofort.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="text-[var(--color-accent)] font-semibold shrink-0">4.</span>
              <span>Die Rechnung kommt gebündelt an dein Unternehmen — kein Self-Checkout für deine Mitarbeiter.</span>
            </li>
          </ul>
        </div>

        <div className="pt-1">
          <a href="mailto:kontakt@deepling.de?subject=Deepling%20f%C3%BCr%20mein%20Team" className="btn btn-primary btn-block">
            Unverbindlich anfragen →
          </a>
          <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
            Schreib uns an{' '}
            <a href="mailto:kontakt@deepling.de" className="underline">kontakt@deepling.de</a>
            {' '}— wir melden uns innerhalb eines Werktags.
          </p>
        </div>
      </div>

      {!isLoggedIn && (
        <div className="mt-6 card bg-[var(--color-accent-soft)] border-[var(--color-accent)] border-opacity-30">
          <p className="text-sm text-[var(--color-ink)]">
            <strong>Du hast schon einen Zugangscode?</strong>{' '}
            <Link href="/signup" className="text-[var(--color-accent)] underline">Konto anlegen</Link>{' '}
            und Code beim Registrieren eingeben.
          </p>
        </div>
      )}

      {/* Self-Service-Checkout bleibt im Code (PlanCard/CheckoutButton) für
          späteres Self-Service-Pricing, ist aber bewusst nicht gerendert.
          showTestPlan-Param weiterhin akzeptiert für interne E2E-Tests. */}
      {showTestPlan && (
        <div className="mt-6 space-y-3">
          <p className="text-xs text-[var(--color-warning)] uppercase tracking-wider">Intern · nur Demo-Accounts</p>
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
        </div>
      )}
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
