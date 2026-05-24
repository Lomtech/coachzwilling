import { requireAdmin } from '@/lib/admin-auth'
import { serviceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface LeadRow {
  id: string
  email: string | null
  name: string | null
  source: string
  short_profile: string | null
  answers: unknown
  user_agent: string | null
  converted_user_id: string | null
  created_at: string
}

export default async function AdminLeadsPage() {
  await requireAdmin()
  const supa = serviceClient()

  const { data: leads } = await supa
    .from('leads')
    .select('id, email, name, source, short_profile, answers, user_agent, converted_user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const items = (leads ?? []) as LeadRow[]
  const stats = {
    total: items.length,
    withEmail: items.filter(l => !!l.email).length,
    converted: items.filter(l => !!l.converted_user_id).length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads (Mini-Scan)</h1>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          Einträge aus dem Lead-Magnet /mini-scan.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Leads gesamt" value={String(stats.total)} />
        <Stat label="Mit E-Mail" value={String(stats.withEmail)} />
        <Stat label="Konvertiert" value={String(stats.converted)} highlight={stats.converted > 0} />
      </div>

      {items.length === 0 ? (
        <div className="card text-sm text-[var(--color-ink-2)]">Noch keine Leads.</div>
      ) : (
        <div className="space-y-2">
          {items.map(l => (
            <div key={l.id} className="card">
              <div className="flex items-start justify-between text-xs text-[var(--color-muted)] mb-2">
                <span className="font-medium text-[var(--color-ink)]">
                  {l.email ?? '(ohne E-Mail)'}
                  {l.name && <span className="text-[var(--color-muted)] font-normal"> · {l.name}</span>}
                </span>
                <span>{new Date(l.created_at).toLocaleString('de-DE')}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap text-[var(--color-ink-2)] line-clamp-6">
                {l.short_profile ?? '(Kurzprofil konnte nicht generiert werden)'}
              </div>
              {l.converted_user_id && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-success)]">
                  ✓ Hat einen Account angelegt
                </div>
              )}
            </div>
          ))}
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
