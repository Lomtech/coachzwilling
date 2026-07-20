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
  max_seats: number
  used_seats: number
}

type RedemptionRow = { code_id: string; user_id: string; redeemed_at: string }

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default async function AdminCodesPage() {
  const supa = serviceClient()

  const { data } = await (supa as any)
    .from('unlock_codes')
    .select('id, code, label, created_at, active, max_seats, used_seats')
    .order('created_at', { ascending: false })
  const codes = (data ?? []) as CodeRow[]

  // Wer hat welchen Code eingelöst (eigene Tabelle, da ein Code mehrere Plätze hat).
  let redemptions: RedemptionRow[] = []
  if (codes.length) {
    const { data: redData } = await (supa as any)
      .from('unlock_code_redemptions')
      .select('code_id, user_id, redeemed_at')
      .in('code_id', codes.map(c => c.id))
    redemptions = (redData ?? []) as RedemptionRow[]
  }

  const userIds = Array.from(new Set(redemptions.map(r => r.user_id)))
  const nameById = new Map<string, string>()
  if (userIds.length) {
    const { data: profs } = await supa
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of profs ?? []) nameById.set(p.id, p.full_name || p.email || p.id)
  }

  const byCode = new Map<string, RedemptionRow[]>()
  for (const r of redemptions) {
    const arr = byCode.get(r.code_id) ?? []
    arr.push(r)
    byCode.set(r.code_id, arr)
  }

  const plaetzeGesamt = codes.reduce((a, c) => a + c.max_seats, 0)
  const plaetzeVergeben = codes.reduce((a, c) => a + c.used_seats, 0)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Freischalt-Codes</h1>
      <p className="text-sm text-[var(--color-ink-2)] mb-6">
        {codes.length} Codes · {plaetzeVergeben} von {plaetzeGesamt} Plätzen vergeben.
        Ein Code schaltet die <strong>vollständige Analyse</strong> gratis frei —
        <strong> 1 Platz</strong> für einen einzelnen Klienten, <strong>N Plätze</strong> für ein
        Firmenpaket (ein Code, den alle Mitarbeitenden einlösen).
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
              <th className="py-2 pr-4 font-medium">Für wen</th>
              <th className="py-2 pr-4 font-medium">Plätze</th>
              <th className="py-2 pr-4 font-medium">Eingelöst von</th>
              <th className="py-2 pr-4 font-medium">Erstellt</th>
              <th className="py-2 pr-2 font-medium text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-[var(--color-muted)]">
                Noch keine Codes. Erzeuge oben deinen ersten.
              </td></tr>
            )}
            {codes.map(c => {
              const reds = byCode.get(c.id) ?? []
              const voll = c.used_seats >= c.max_seats
              const seatCls = !c.active
                ? 'text-[var(--color-muted)]'
                : voll ? 'text-[var(--color-muted)]' : 'text-[var(--color-success)]'
              return (
                <tr key={c.id} className="border-b border-[var(--color-border)]/60 last:border-0 align-top">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono select-all">{c.code}</span>
                    {!c.active && (
                      <span className="ml-2 text-xs text-[var(--color-muted)]">(deaktiviert)</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--color-ink-2)]">{c.label || '—'}</td>
                  <td className={'py-2.5 pr-4 whitespace-nowrap ' + seatCls}>
                    {c.used_seats} / {c.max_seats}
                    {voll && c.active && <span className="ml-1 text-xs">voll</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--color-ink-2)]">
                    {reds.length === 0 ? '—' : (
                      <ul className="space-y-0.5">
                        {reds.map(r => (
                          <li key={r.user_id} className="text-xs">
                            {nameById.get(r.user_id) ?? 'unbekannt'}
                            <span className="text-[var(--color-muted)]"> · {fmt(r.redeemed_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--color-muted)] whitespace-nowrap">{fmt(c.created_at)}</td>
                  <td className="py-2.5 pr-2 text-right">
                    <form action={setUnlockCodeActive} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={(!c.active).toString()} />
                      <button type="submit" className="text-xs underline underline-offset-2 text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">
                        {c.active ? 'deaktivieren' : 'aktivieren'}
                      </button>
                    </form>
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
