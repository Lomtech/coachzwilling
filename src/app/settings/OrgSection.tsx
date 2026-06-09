import Link from 'next/link'
import { listMyOrgs } from '@/lib/org/auth'

/**
 * Server-Komponente: zeigt die Org-Mitgliedschaften des Users in den Settings.
 * Rendert nichts wenn der User in keiner Org ist (kein leeres Element für
 * Solo-User).
 */
export async function OrgSection() {
  const orgs = await listMyOrgs()
  if (orgs.length === 0) return null

  const adminOrgs = orgs.filter(o => o.role === 'hr_admin' || o.role === 'owner')

  return (
    <section className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">Organisationen</h2>
        <Link href="/org" className="text-xs text-[var(--color-accent)] hover:underline">
          Alle anzeigen →
        </Link>
      </div>
      <ul className="divide-y divide-[var(--color-border)]">
        {orgs.map(o => {
          const isAdmin = o.role === 'hr_admin' || o.role === 'owner'
          return (
            <li key={o.org_id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">{o.org_name}</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {o.role === 'owner' ? 'Owner' : o.role === 'hr_admin' ? 'HR-Admin' : 'Mitglied'}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/org/${o.org_id}/manage`}
                    className="text-sm text-[var(--color-ink-2)] hover:underline"
                  >
                    Verwalten
                  </Link>
                  <Link
                    href={`/org/${o.org_id}/dashboard`}
                    className="text-sm text-[var(--color-accent)] hover:underline"
                  >
                    Dashboard →
                  </Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {adminOrgs.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)] leading-relaxed">
          Das HR-Dashboard zeigt aggregierte Stress- und Verhaltens-Signale aus
          dem Living Memory deiner Mitarbeitenden — k-anonym, ohne individuell
          zuordenbare Daten.
        </p>
      )}
    </section>
  )
}
