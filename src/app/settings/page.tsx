import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/types/database'
import { MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'
import { LogoutButton } from './LogoutButton'
import { SetPasswordForm } from '@/components/auth/SetPasswordForm'
import { ManageButton } from '../billing/ManageButton'
import { MemoryView } from './MemoryView'
import { RegenerateProfileButton } from './RegenerateProfileButton'
import { RefineProfileButton } from './RefineProfileButton'
import { RestartOnboardingButton } from './RestartOnboardingButton'
import { ProfileViewer } from './ProfileViewer'
import { ShareProfileSection } from './ShareProfileSection'
import { TestimonialSection } from './TestimonialSection'
import { FollowupSection } from './FollowupSection'
import { OrgSection } from './OrgSection'
import { QUESTIONS } from '@/data/questionnaire'
import { RedeemCodeSection } from './RedeemCodeSection'
import { listMyOrgs } from '@/lib/org/auth'
import { IconChevronDown, IconSettings, IconCompare } from '@/components/Icons'
import { isAdminEmail } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/settings')

  const [{ data: profile }, { data: sub }, { data: cp }, { data: memoryRows }, { count: memoryCount }, { count: assistantMsgCount }, { count: testimonialCount }, { data: recentFollowups }] = await Promise.all([
    supabase.from('profiles').select('full_name, email, onboarding_state, created_at, trial_until, followup_enabled, followup_frequency_days, last_followup_at').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, current_period_end, cancel_at_period_end').eq('user_id', user.id).maybeSingle(),
    supabase.from('coach_profiles')
      .select('id, generated_at, model, version, source, memories_used_count, config_md, share_token, share_enabled')
      // order+limit wie in der Chat-Route: .maybeSingle() allein WIRFT, sobald
      // je mehr als eine aktive Zeile existiert (kam durch eine Refresh-Race
      // wirklich vor → Seite zeigte fälschlich „kein Coach-Profil").
      .eq('user_id', user.id).eq('is_active', true)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('coach_memory')
      .select('id, section, observation, importance, created_at')
      .eq('user_id', user.id).eq('is_active', true)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('coach_memory')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_active', true),
    supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('role', 'assistant'),
    supabase.from('testimonials')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase.from('email_followups')
      .select('id, subject, sent_at, opened_at, clicked_at')
      .eq('user_id', user.id)
      .order('composed_at', { ascending: false })
      .limit(5),
  ])

  // Fehlende Fragebogen-Antworten (der Bogen wuchs nachträglich von 42 auf 50).
  // Betroffene können die Lücke nachtragen, statt neu anzufangen.
  const { data: qr } = await supabase
    .from('questionnaire_responses')
    .select('answers')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const qrAnswers = (qr?.answers as Record<string, string> | undefined) ?? {}
  const fehlendeFragen = Object.keys(qrAnswers).length > 0
    ? QUESTIONS.filter(q => !qrAnswers[String(q.id)]).length
    : 0

  const memoriesSinceRefresh = Math.max(0, (memoryCount ?? 0) - (cp?.memories_used_count ?? 0))

  const memoryItems = (memoryRows ?? []).map(r => ({
    id: r.id,
    section: r.section,
    section_label: MEMORY_SECTION_LABELS[r.section] ?? r.section,
    observation: r.observation,
    importance: r.importance,
    created_at: r.created_at,
  }))

  const subActive = sub && ACTIVE_STATUSES.has(sub.status)
  const trialMs = profile?.trial_until ? new Date(profile.trial_until).getTime() - Date.now() : 0
  const trialDaysLeft = Math.max(0, Math.ceil(trialMs / 86_400_000))
  const trialActive = trialDaysLeft > 0 && !subActive
  const myOrgs = await listMyOrgs()
  const isOrgMember = myOrgs.length > 0

  return (
    <main className="min-h-dvh px-5 py-6 max-w-xl w-full mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/coach" className="font-semibold text-lg tracking-tight">
          ← Coach
        </Link>
        <span className="text-sm text-[var(--color-muted)]">Konto</span>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight mb-6">Dein Konto</h1>

      <section className="card mb-4">
        <SectionHeader>Profil</SectionHeader>
        <Row label="Name" value={profile?.full_name ?? '—'} />
        <Row label="E-Mail" value={profile?.email ?? user.email ?? '—'} />
        <Row label="Status" value={statusLabel(profile?.onboarding_state)} />
      </section>

      <section className="card mb-4">
        <SectionHeader>Coach-Profil</SectionHeader>
        {cp ? (
          <>
            <Row label="Version" value={`v${cp.version}`} />
            <Row label="Quelle" value={sourceLabel(cp.source)} />
            <Row label="Aktualisiert" value={formatDate(cp.generated_at)} />
            <Row label="Modell" value={cp.model} />
            {cp.memories_used_count > 0 && (
              <Row label="Memories einbezogen" value={String(cp.memories_used_count)} />
            )}
            {memoriesSinceRefresh > 0 && (
              <Row
                label="Neue Memories seit Refresh"
                value={
                  <span className={memoriesSinceRefresh >= 20 ? 'text-[var(--color-success)] font-medium' : ''}>
                    {memoriesSinceRefresh}{memoriesSinceRefresh >= 20 ? ' — Auto-Refresh greift bald' : ''}
                  </span>
                }
              />
            )}
            {/* Kurz-Profil (Deep-Space-Design) für ALLE — bekommt jeder nach
                dem Fragebogen auch per Mail verlinkt. Der rohe config_md-Viewer
                bleibt Admin-only. */}
            <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-2">
              <a
                href="/mein-profil"
                target="_blank"
                rel="noopener"
                className="btn btn-secondary btn-block text-sm"
                title="Dein Kurz-Profil öffnen — mit Cmd/Strg+P als PDF speichern"
              >
                ✦ Dein Kurz-Profil ansehen
              </a>
              {fehlendeFragen > 0 && (
                <a href="/onboarding/ergaenzen" className="btn btn-secondary btn-block text-sm">
                  + {fehlendeFragen} fehlende {fehlendeFragen === 1 ? 'Frage' : 'Fragen'} ergänzen
                </a>
              )}
              {isAdminEmail(user.email) && (
                <ProfileViewer profile={{
                  id: cp.id,
                  version: cp.version,
                  source: cp.source,
                  generatedAt: cp.generated_at,
                  configMd: cp.config_md,
                }} />
              )}
              <RefineProfileButton hasMemories={(memoryCount ?? 0) > 0} />
            </div>

            {/* Sekundärer Block: seltenere Aktionen, optisch deutlich abgesetzt. */}
            <details className="mt-4 pt-4 border-t border-[var(--color-border)] group">
              <summary className="cursor-pointer list-none flex items-center justify-between text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider hover:text-[var(--color-ink)]">
                <span>Erweitert — Profil zurücksetzen</span>
                <IconChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-2">
                <RegenerateProfileButton />
                <RestartOnboardingButton />
                <p className="text-xs text-[var(--color-muted)] pt-2">
                  „Neu generieren" baut das Profil ausschließlich aus deinen 50 Onboarding-Antworten —
                  Memory + Chat-Verlauf bleiben erhalten, fließen aber nicht ein. „Fragebogen neu machen"
                  startet den 50-Fragen-Scan komplett neu — sinnvoll wenn sich deine Situation grundlegend
                  geändert hat.
                </p>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-2)]">
            Noch kein Profil. <Link href="/onboarding" className="underline">Fragebogen ausfüllen</Link>.
          </p>
        )}
      </section>

      {cp && (
        <ShareProfileSection
          initialEnabled={cp.share_enabled ?? false}
          initialToken={cp.share_token ?? null}
        />
      )}

      <TestimonialSection
        showPrompt={(assistantMsgCount ?? 0) >= 5}
        alreadySubmitted={(testimonialCount ?? 0) > 0}
        defaultName={profile?.full_name ?? null}
      />

      <FollowupSection
        initialEnabled={profile?.followup_enabled ?? false}
        initialFrequencyDays={profile?.followup_frequency_days ?? 4}
        lastSent={profile?.last_followup_at ?? null}
        recentMails={recentFollowups ?? []}
      />

      <OrgSection />

      {/* Unternehmenscode einlösen — nur für normale User ohne Org-Zugang.
          Admins (Betreiber) brauchen keinen Code; sie haben vollen Zugang
          über den Admin-Bypass. */}
      {!isOrgMember && !isAdminEmail(user.email) && (
        <section className="card mb-4">
          <SectionHeader>Unternehmenszugang</SectionHeader>
          <RedeemCodeSection isOrgMember={isOrgMember} />
        </section>
      )}

      {process.env.NEXT_PUBLIC_SHOW_MEMORY === 'true' && (
        <section className="card mb-4">
          <SectionHeader>Living Memory</SectionHeader>
          <MemoryView initialItems={memoryItems} />
        </section>
      )}

      {/* Abo-Section nur für zahlende Sub-Kunden. Trial-Anzeige ("X Tage
          gratis") komplett entfernt — Geschäftsmodell ist B2B-Direktverkauf,
          kein Self-Service-Trial. */}
      {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && sub && subActive && (
      <section className="card mb-4">
        <SectionHeader>Abo</SectionHeader>
        <Row label="Status" value={statusBadge(sub.status)} />
        <Row label="Nächste Verlängerung" value={formatDate(sub.current_period_end)} />
        {sub.cancel_at_period_end && (
          <p className="text-sm text-[var(--color-warning)] mt-2">
            Wird zum Periodenende gekündigt.
          </p>
        )}
        <div className="mt-4">
          <ManageButton />
        </div>
      </section>
      )}

      {isAdminEmail(user.email) && (
        <section className="card mb-4 bg-[var(--color-warning)]/5 border-[var(--color-warning)]/30">
          <SectionHeader>Admin</SectionHeader>
          <p className="text-sm text-[var(--color-ink-2)] mb-3">
            Du bist als Admin eingeloggt. Zugriff auf alle User-Profile und Memory-Daten.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href="/admin" className="btn btn-secondary text-sm flex-1 inline-flex items-center justify-center gap-2">
              <IconSettings className="w-4 h-4" />
              <span>Admin-Übersicht</span>
            </Link>
            <Link href="/admin/compare" className="btn btn-secondary text-sm flex-1 inline-flex items-center justify-center gap-2">
              <IconCompare className="w-4 h-4" />
              <span>Profile vergleichen</span>
            </Link>
          </div>
        </section>
      )}

      <section className="card">
        <SectionHeader>Sicherheit</SectionHeader>

        <details className="mb-4 group">
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium hover:text-[var(--color-ink)]">
            <span>Passwort setzen / ändern</span>
            <IconChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3">
            <SetPasswordForm submitLabel="Passwort speichern" />
          </div>
        </details>

        <LogoutButton />
      </section>
    </main>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">{children}</h2>
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[var(--color-ink-2)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function statusLabel(s?: string): string {
  switch (s) {
    case 'pending': return 'Noch nicht gestartet'
    case 'questionnaire': return 'Fragebogen läuft'
    case 'profiled': return 'Profil erstellt'
    case 'active': return 'Aktiv'
    default: return '—'
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'onboarding':       return 'Aus Onboarding'
    case 'manual_refresh':   return 'Manuell verfeinert'
    case 'auto_refresh':     return 'Automatisch verfeinert'
    default:                 return s
  }
}

function statusBadge(s: string): string {
  switch (s) {
    case 'active': return 'Aktiv'
    case 'trialing': return 'Probezeit'
    case 'past_due': return 'Zahlung offen'
    case 'canceled': return 'Gekündigt'
    case 'incomplete': return 'Unvollständig'
    case 'paused': return 'Pausiert'
    default: return s
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
