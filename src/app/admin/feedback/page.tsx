import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { serviceClient } from '@/lib/supabase/service'
import { getHiddenUserIds } from '@/lib/admin/hidden-users'

export const dynamic = 'force-dynamic'

interface FeedbackRow {
  id: string
  rating: number
  comment: string | null
  created_at: string
  message_id: string
  user_id: string
}

interface MessageRow {
  id: string
  content: string
  conversation_id: string
}

interface UserRow {
  id: string
  full_name: string | null
  email: string
}

export default async function AdminFeedbackPage() {
  await requireAdmin()
  const supa = serviceClient()

  const hiddenIds = await getHiddenUserIds()
  const { data: feedbacks } = await supa
    .from('message_feedback')
    .select('id, rating, comment, created_at, message_id, user_id')
    .order('created_at', { ascending: false })
    .limit(200)

  const items = ((feedbacks ?? []) as FeedbackRow[]).filter(f => !hiddenIds.has(f.user_id))

  const msgIds = Array.from(new Set(items.map(f => f.message_id)))
  const userIds = Array.from(new Set(items.map(f => f.user_id)))

  const [{ data: msgs }, { data: users }] = await Promise.all([
    msgIds.length > 0
      ? supa.from('messages').select('id, content, conversation_id').in('id', msgIds)
      : Promise.resolve({ data: [] }),
    userIds.length > 0
      ? supa.from('profiles').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const msgById = new Map<string, MessageRow>(
    ((msgs ?? []) as MessageRow[]).map(m => [m.id, m])
  )
  const userById = new Map<string, UserRow>(
    ((users ?? []) as UserRow[]).map(u => [u.id, u])
  )

  const stats = {
    total: items.length,
    up: items.filter(f => f.rating === 1).length,
    down: items.filter(f => f.rating === -1).length,
  }
  const ratio = stats.total > 0 ? Math.round((stats.up / stats.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          Daumen-Bewertungen pro Coach-Antwort. Hilft den Fragebogen und das System-Prompt zu schärfen.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Gesamt" value={String(stats.total)} />
        <Stat label="👍 Hilfreich" value={String(stats.up)} />
        <Stat label="👎 Trifft nicht" value={String(stats.down)} />
        <Stat label="Positiv-Quote" value={`${ratio}%`} highlight={ratio >= 70} />
      </div>

      {items.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-2)]">
          Noch keine Bewertungen.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(f => {
            const msg = msgById.get(f.message_id)
            const usr = userById.get(f.user_id)
            const snippet = (msg?.content ?? '').slice(0, 280).trim()
            return (
              <div key={f.id} className="card">
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
                  <span className="flex items-center gap-2">
                    <span className={f.rating === 1 ? 'text-[var(--color-success)] font-medium' : 'text-[var(--color-danger)] font-medium'}>
                      {f.rating === 1 ? '👍' : '👎'}
                    </span>
                    <span>{usr ? `${usr.full_name ?? '—'} (${usr.email})` : 'Unbekannt'}</span>
                    {msg?.conversation_id && (
                      <Link
                        href={`/admin/users/${f.user_id}`}
                        className="underline hover:no-underline"
                      >
                        User öffnen →
                      </Link>
                    )}
                  </span>
                  <span>{new Date(f.created_at).toLocaleString('de-DE')}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap text-[var(--color-ink-2)]">
                  {snippet || '(leere Coach-Antwort)'}
                  {msg && msg.content.length > 280 ? ' …' : ''}
                </div>
                {f.comment && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-sm">
                    <span className="text-xs text-[var(--color-muted)] block mb-1">Kommentar:</span>
                    {f.comment}
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
