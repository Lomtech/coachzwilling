import { requireAdmin } from '@/lib/admin-auth'
import { serviceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface FollowupRow {
  id: string
  user_id: string
  subject: string
  body_text: string
  source_summary: string | null
  composed_at: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  complained_at: string | null
}

interface UserRow {
  id: string
  full_name: string | null
  email: string
  followup_enabled: boolean
}

export default async function AdminFollowupsPage() {
  await requireAdmin()
  const supa = serviceClient()

  const [{ data: followups }, { data: users }] = await Promise.all([
    supa
      .from('email_followups')
      .select('id, user_id, subject, body_text, source_summary, composed_at, sent_at, opened_at, clicked_at, bounced_at, complained_at')
      .order('composed_at', { ascending: false })
      .limit(200),
    supa.from('profiles').select('id, full_name, email, followup_enabled'),
  ])

  const items = (followups ?? []) as FollowupRow[]
  const usersList = (users ?? []) as UserRow[]
  const userById = new Map(usersList.map(u => [u.id, u]))

  const sentItems = items.filter(f => f.sent_at)
  const stats = {
    total: items.length,
    sent: sentItems.length,
    opened: items.filter(f => f.opened_at).length,
    clicked: items.filter(f => f.clicked_at).length,
    bounced: items.filter(f => f.bounced_at).length,
    complained: items.filter(f => f.complained_at).length,
    optedIn: usersList.filter(u => u.followup_enabled).length,
    totalUsers: usersList.length,
  }
  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0
  const clickRate = stats.sent > 0 ? Math.round((stats.clicked / stats.sent) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-up-Emails</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          Auto-Mails vom Coach an User. Cron läuft täglich 07:00 UTC. Material aus Memory + Commitments.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Opt-in" value={`${stats.optedIn} / ${stats.totalUsers}`} />
        <Stat label="Gesendet" value={String(stats.sent)} />
        <Stat label="Open-Rate" value={`${openRate}%`} highlight={openRate >= 40} />
        <Stat label="Click-Rate" value={`${clickRate}%`} highlight={clickRate >= 10} />
      </div>

      {(stats.bounced > 0 || stats.complained > 0) && (
        <div className="card bg-[var(--color-danger)]/5 border-[var(--color-danger)]/30 text-sm">
          <strong>Probleme:</strong> {stats.bounced} Bounces · {stats.complained} Spam-Complaints
          — empfänger-Liste prüfen.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-2)]">
          Noch keine Follow-up-Mails komponiert.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(f => {
            const usr = userById.get(f.user_id)
            return (
              <div key={f.id} className="card">
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
                  <span className="font-medium text-[var(--color-ink)]">
                    {usr ? `${usr.full_name ?? '—'} (${usr.email})` : 'Unbekannt'}
                  </span>
                  <div className="flex items-center gap-2">
                    {f.sent_at && (
                      <span title="gesendet">
                        {new Date(f.sent_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {!f.sent_at && <span className="text-[var(--color-warning)]">noch nicht gesendet</span>}
                    {f.opened_at && <span className="chip text-[10px] py-0.5 px-1.5 bg-[var(--color-success)]/15 text-[var(--color-success)]">opened</span>}
                    {f.clicked_at && <span className="chip text-[10px] py-0.5 px-1.5 bg-[var(--color-accent)]/15 text-[var(--color-accent)]">clicked</span>}
                    {f.bounced_at && <span className="chip text-[10px] py-0.5 px-1.5 bg-[var(--color-danger)]/15 text-[var(--color-danger)]">bounce</span>}
                  </div>
                </div>
                <div className="text-sm font-medium mb-1">{f.subject}</div>
                <div className="text-xs text-[var(--color-ink-2)] whitespace-pre-wrap line-clamp-4">
                  {f.body_text}
                </div>
                {f.source_summary && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
                    Anker: {f.source_summary}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs text-[var(--color-muted)] uppercase tracking-wider">{label}</div>
      <div className={'mt-1 text-2xl font-semibold ' + (highlight ? 'text-[var(--color-success)]' : '')}>{value}</div>
    </div>
  )
}
