import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMyOrgs } from '@/lib/org/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Übersicht: alle Organisationen in denen der User Mitglied ist.
// HR-Admin/Owner sehen einen "Dashboard"-Button, normale Member sehen
// nur die Mitgliedschaft (ohne Aggregat-Zugang).
export default async function OrgIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/org')

  const orgs = await listMyOrgs()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Organisationen</h1>
          <div className="flex items-center gap-2">
            <Link href="/org/new" className="btn btn-primary text-sm">+ Neue Org</Link>
            <Link href="/settings" className="btn btn-ghost text-sm">← Zurück</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {orgs.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[var(--color-ink-2)]">
              Du bist aktuell in keiner Organisation Mitglied.
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Wenn dein Unternehmen den Deepling lizenziert, lade dich
              die HR-Verantwortlichen per E-Mail-Einladung in eure Organisation
              ein — oder lege selbst eine an, wenn du HR-Verantwortlicher bist.
            </p>
            <Link href="/org/new" className="btn btn-primary mt-6 inline-block">
              Eigene Organisation anlegen →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orgs.map(o => {
              const isAdmin = o.role === 'hr_admin' || o.role === 'owner'
              return (
                <li key={o.org_id} className="card p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-0.5">
                      {o.role === 'owner' ? 'Owner' : o.role === 'hr_admin' ? 'HR-Admin' : 'Mitglied'}
                    </div>
                    <div className="font-semibold">{o.org_name}</div>
                    <div className="text-xs text-[var(--color-muted)]">/{o.org_slug}</div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/org/${o.org_id}/manage`}
                        className="btn btn-secondary text-sm"
                      >
                        Verwalten
                      </Link>
                      <Link
                        href={`/org/${o.org_id}/dashboard`}
                        className="btn btn-primary text-sm"
                      >
                        Dashboard →
                      </Link>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
