import Link from 'next/link'
import { serviceClient } from '@/lib/supabase/service'
import { getHiddenUserIds } from '@/lib/admin/hidden-users'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const supa = serviceClient()

  // Hidden-User-Set holen (Test-/Privacy-Accounts unsichtbar machen)
  const hiddenIds = await getHiddenUserIds()

  // Alle Profile mit Aggregaten — hidden Accounts werden gefiltert
  const { data: profilesRaw } = await supa
    .from('profiles')
    .select('id, email, full_name, onboarding_state, created_at, trial_until')
    .order('created_at', { ascending: false })
  const profiles = (profilesRaw ?? []).filter(p => !hiddenIds.has(p.id))

  // Stats pro User parallel laden
  const userIds = profiles.map(p => p.id)

  const [coachProfiles, memoryCounts, conversationCounts, messageCounts, responses] = await Promise.all([
    supa.from('coach_profiles')
      .select('id, user_id, version, source, generated_at, model')
      .in('user_id', userIds)
      .eq('is_active', true),
    supa.from('coach_memory')
      .select('user_id', { count: 'exact', head: false })
      .in('user_id', userIds)
      .eq('is_active', true),
    supa.from('conversations')
      .select('user_id, updated_at')
      .in('user_id', userIds),
    supa.from('messages')
      .select('user_id')
      .in('user_id', userIds),
    supa.from('questionnaire_responses')
      .select('user_id, completed_at')
      .in('user_id', userIds)
      .not('completed_at', 'is', null),
  ])

  const cpByUser = new Map((coachProfiles.data ?? []).map(r => [r.user_id, r]))

  // Memory count manually count per user_id
  const memByUser = new Map<string, number>()
  for (const m of (memoryCounts.data ?? [])) {
    memByUser.set(m.user_id, (memByUser.get(m.user_id) ?? 0) + 1)
  }

  const convByUser = new Map<string, { count: number; lastActivity: string | null }>()
  for (const c of (conversationCounts.data ?? [])) {
    const e = convByUser.get(c.user_id) ?? { count: 0, lastActivity: null }
    e.count += 1
    if (!e.lastActivity || c.updated_at > e.lastActivity) e.lastActivity = c.updated_at
    convByUser.set(c.user_id, e)
  }

  const msgByUser = new Map<string, number>()
  for (const m of (messageCounts.data ?? [])) {
    msgByUser.set(m.user_id, (msgByUser.get(m.user_id) ?? 0) + 1)
  }

  const respByUser = new Map<string, string>()
  for (const r of (responses.data ?? [])) {
    if (r.completed_at) respByUser.set(r.user_id, r.completed_at)
  }

  const rows = profiles.map(p => ({
    ...p,
    coach: cpByUser.get(p.id),
    memoryCount: memByUser.get(p.id) ?? 0,
    convCount: convByUser.get(p.id)?.count ?? 0,
    lastActivity: convByUser.get(p.id)?.lastActivity ?? null,
    msgCount: msgByUser.get(p.id) ?? 0,
    onboardingCompleted: respByUser.get(p.id) ?? null,
  }))

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">User & Profile</h1>
      <p className="text-sm text-[var(--color-ink-2)] mb-6">
        {rows.length} User · {rows.filter(r => r.coach).length} mit Coach-Profil ·{' '}
        {Array.from(memByUser.values()).reduce((a, b) => a + b, 0)} Memory-Einträge total
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="text-left py-2 px-2 font-medium">User</th>
              <th className="text-left py-2 px-2 font-medium">Status</th>
              <th className="text-right py-2 px-2 font-medium">Profil</th>
              <th className="text-right py-2 px-2 font-medium">Memory</th>
              <th className="text-right py-2 px-2 font-medium">Chats</th>
              <th className="text-right py-2 px-2 font-medium">Msgs</th>
              <th className="text-left py-2 px-2 font-medium">Letzte Aktivität</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="py-3 px-2">
                  <Link href={`/admin/users/${r.id}`} className="text-[var(--color-accent)] hover:underline">
                    {r.full_name || '—'}
                  </Link>
                  <div className="text-xs text-[var(--color-muted)]">{r.email}</div>
                </td>
                <td className="py-3 px-2">
                  <span className="text-xs">{stateLabel(r.onboarding_state)}</span>
                </td>
                <td className="py-3 px-2 text-right">
                  {r.coach ? (
                    <Link
                      href={`/admin/profiles/${r.coach.id}`}
                      className="text-xs text-[var(--color-accent)] hover:underline"
                    >
                      v{r.coach.version} · {sourceLabel(r.coach.source)} →
                    </Link>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
                  )}
                </td>
                <td className="py-3 px-2 text-right tabular-nums">{r.memoryCount}</td>
                <td className="py-3 px-2 text-right tabular-nums">{r.convCount}</td>
                <td className="py-3 px-2 text-right tabular-nums">{r.msgCount}</td>
                <td className="py-3 px-2 text-xs text-[var(--color-muted)]">
                  {fmt(r.lastActivity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-[var(--color-muted)]">
        Klick auf einen Namen für Detail-View (Antworten + Memory + Profile-Historie). Compare-Page für Diff zwischen zwei Profilen.
      </div>
    </>
  )
}

function stateLabel(s?: string | null): string {
  switch (s) {
    case 'pending': return '⚪ pending'
    case 'questionnaire': return '🟡 scan'
    case 'profiled': return '🟢 profiled'
    case 'active': return '🟢 active'
    default: return s ?? '—'
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'onboarding': return 'onboarding'
    case 'manual_refresh': return 'manual'
    case 'auto_refresh': return 'auto'
    default: return s
  }
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days === 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
