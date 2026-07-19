import { serviceClient } from '@/lib/supabase/service'
import { CreateCodeForm } from './CreateCodeForm'
import { setUnlockCodeActive } from './actions'

export const dynamic = 'force-dynamic'

type CodeRow = {
  id: string
  code: string
  label: string | null
  created_at: string
  active: boolean
  redeemed_by: string | null
  redeemed_at: string | null
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default async function AdminCodesPage() {
  const supa = serviceClient()
  const { data } = await (supa as any)
    .from('unlock_codes')
    .select('id, code, label, created_at, active, redeemed_by, redeemed_at')
    .order('created_at', { ascending: false })
  const codes = (data ?? []) as CodeRow[]

  const redeemerIds = Array.from(new Set(codes.map(c => c.redeemed_by).filter(Boolean))) as string[]
  const nameById = new Map<string, string>()
  if (redeemerIds.length) {
    const { data: profs } = await supa
      .from('profiles')
      .select('id, full_name, email')
      .in('id', redeemerIds)
    for (const p of profs ?? []) nameById.set(p.id, p.full_name || p.email || p.id)
  }

  const openCount = codes.filter(c => c.active && !c.redeemed_by).length
  const usedCount = codes.filter(c => c.redeemed_by).length

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Freischalt-Codes</h1>
      <p className="text-sm text-[var(--color-ink-2)] mb-6">
        {codes.length} Codes · {openCount} offen · {usedCount} eingelöst. Ein Code schaltet die
        Vollanalyse (149 €) für <strong>einen</strong> Klienten gratis frei — einmal einlösbar.
      </p>

      <div className="card mb-6">
        <div className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
          Neuen Code erzeugen
        </div>
        <CreateCodeForm />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Klient / Notiz</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Erstellt</th>
              <th className="py-2 pr-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-[var(--color-muted)]">
                Noch keine Codes. Erzeuge oben deinen ersten.
              </td></tr>
            )}
            {codes.map(c => {
              const redeemed = Boolean(c.redeemed_by)
              const status = redeemed
                ? { text: `eingelöst · ${nameById.get(c.redeemed_by!) ?? 'unbekannt'} · ${fmt(c.redeemed_at)}`, cls: 'text-[var(--color-success)]' }
                : c.active
                  ? { text: 'offen', cls: 'text-[var(--color-ink-2)]' }
                  : { text: 'deaktiviert', cls: 'text-[var(--color-muted)]' }
              return (
                <tr key={c.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono select-all">{c.code}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--color-ink-2)]">{c.label || '—'}</td>
                  <td className={'py-2.5 pr-4 ' + status.cls}>{status.text}</td>
                  <td className="py-2.5 pr-4 text-[var(--color-muted)]">{fmt(c.created_at)}</td>
                  <td className="py-2.5 pr-2 text-right">
                    {redeemed ? (
                      <span className="text-xs text-[var(--color-muted)]">—</span>
                    ) : (
                      <form action={setUnlockCodeActive} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={(!c.active).toString()} />
                        <button type="submit" className="text-xs underline underline-offset-2 text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
                          {c.active ? 'deaktivieren' : 'aktivieren'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
