import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_STATUSES } from '@/types/database'
import { MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'
import { LogoutButton } from './LogoutButton'
import { ManageButton } from '../billing/ManageButton'
import { MemoryView } from './MemoryView'
import { RegenerateProfileButton } from './RegenerateProfileButton'
import { RefineProfileButton } from './RefineProfileButton'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/settings')

  const [{ data: profile }, { data: sub }, { data: cp }, { data: memoryRows }, { count: memoryCount }] = await Promise.all([
    supabase.from('profiles').select('full_name, email, onboarding_state, created_at, trial_until').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status, current_period_end, cancel_at_period_end').eq('user_id', user.id).maybeSingle(),
    supabase.from('coach_profiles')
      .select('generated_at, model, version, source, memories_used_count')
      .eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    supabase.from('coach_memory')
      .select('id, section, observation, importance, created_at')
      .eq('user_id', user.id).eq('is_active', true)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('coach_memory')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('is_active', true),
  ])

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
            <div className="mt-4 pt-3 border-t border-[var(--color-border)] space-y-3">
              <RefineProfileButton hasMemories={(memoryCount ?? 0) > 0} />
              <RegenerateProfileButton />
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-2)]">
            Noch kein Profil. <Link href="/onboarding" className="underline">Fragebogen ausfüllen</Link>.
          </p>
        )}
      </section>

      <section className="card mb-4">
        <SectionHeader>Living Memory</SectionHeader>
        <MemoryView initialItems={memoryItems} />
      </section>

      {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && (
      <section className="card mb-4">
        <SectionHeader>Abo</SectionHeader>
        {trialActive && (
          <>
            <Row label="Status" value={<span className="chip">Probezeit gratis</span>} />
            <Row label="Verbleibend" value={`${trialDaysLeft} ${trialDaysLeft === 1 ? 'Tag' : 'Tage'}`} />
            <Row label="Endet am" value={formatDate(profile?.trial_until ?? null)} />
            <p className="text-sm text-[var(--color-ink-2)] mt-3">
              Du nutzt aktuell die kostenlose 7-Tage-Probezeit. Danach brauchst du ein Abo
              für weiteren Zugriff.
            </p>
            <div className="mt-4">
              <Link href="/billing" className="btn btn-primary btn-block">Plan ansehen</Link>
            </div>
          </>
        )}
        {sub && subActive && (
          <>
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
          </>
        )}
        {!trialActive && !subActive && (
          <>
            <p className="text-sm text-[var(--color-ink-2)] mb-3">
              {trialDaysLeft === 0 && profile?.trial_until
                ? 'Deine Probezeit ist abgelaufen.'
                : 'Kein aktives Abo.'}
            </p>
            <Link href="/billing" className="btn btn-primary btn-block">Plan wählen</Link>
          </>
        )}
      </section>
      )}

      <section className="card">
        <SectionHeader>Sicherheit</SectionHeader>
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
