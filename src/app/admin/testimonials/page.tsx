import { requireAdmin } from '@/lib/admin-auth'
import { serviceClient } from '@/lib/supabase/service'
import { getHiddenUserIds } from '@/lib/admin/hidden-users'

export const dynamic = 'force-dynamic'

interface TestimonialRow {
  id: string
  user_id: string
  decision: string
  context: string | null
  allow_publish: boolean
  display_name: string | null
  approved_by_admin: boolean
  created_at: string
}

interface UserRow {
  id: string
  full_name: string | null
  email: string
}

export default async function AdminTestimonialsPage() {
  await requireAdmin()
  const supa = serviceClient()

  const hiddenIds = await getHiddenUserIds()
  const { data } = await supa
    .from('testimonials')
    .select('id, user_id, decision, context, allow_publish, display_name, approved_by_admin, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const items = ((data ?? []) as TestimonialRow[]).filter(t => !hiddenIds.has(t.user_id))
  const userIds = Array.from(new Set(items.map(t => t.user_id)))
  const { data: users } = userIds.length > 0
    ? await supa.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] }
  const userById = new Map<string, UserRow>(((users ?? []) as UserRow[]).map(u => [u.id, u]))

  const stats = {
    total: items.length,
    publishable: items.filter(t => t.allow_publish).length,
    approved: items.filter(t => t.allow_publish && t.approved_by_admin).length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Testimonials</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          User-Entscheidungen aus dem Coaching. "Ich habe X entschieden, weil…"
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gesamt" value={String(stats.total)} />
        <Stat label="Veröffentlichbar" value={String(stats.publishable)} />
        <Stat label="Freigegeben" value={String(stats.approved)} highlight={stats.approved > 0} />
      </div>

      {items.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-2)]">Noch keine Testimonials.</div>
      ) : (
        <div className="space-y-2">
          {items.map(t => {
            const usr = userById.get(t.user_id)
            return (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between text-xs text-[var(--color-muted)] mb-2">
                  <span className="font-medium text-[var(--color-ink)]">
                    {t.display_name ?? (usr?.full_name ?? '—')}
                    <span className="text-[var(--color-muted)] font-normal"> · {usr?.email ?? '—'}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {t.allow_publish && (
                      <span className="chip text-[10px] py-0.5 px-1.5">
                        publish ok
                      </span>
                    )}
                    {t.approved_by_admin && (
                      <span className="chip text-[10px] py-0.5 px-1.5 bg-[var(--color-success)]/15 text-[var(--color-success)]">
                        live
                      </span>
                    )}
                    <span>{new Date(t.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </div>
                <div className="text-sm font-medium whitespace-pre-wrap mb-2">
                  {t.decision}
                </div>
                {t.context && (
                  <div className="text-xs text-[var(--color-ink-2)] whitespace-pre-wrap pt-2 border-t border-[var(--color-border)]">
                    <span className="text-[var(--color-muted)]">Kontext: </span>
                    {t.context}
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
