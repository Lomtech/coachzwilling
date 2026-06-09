import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { AcceptInviteButton } from './AcceptInviteButton'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PageProps {
  params: Promise<{ token: string }>
}

// Public Landing für /invite/<token>
// • Token unbekannt / expired / revoked → "ungültig"-Hinweis
// • User nicht eingeloggt              → Hinweis + Link zu Login/Signup mit
//                                         next=/invite/<token>
// • User eingeloggt                    → Akzeptier-Button (POST /api/invite/accept)
export default async function InvitePage({ params }: PageProps) {
  const { token } = await params

  const supa = serviceClient()
  const { data: inv } = await supa
    .from('org_invitations')
    .select('id, org_id, role, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="card p-8 max-w-md w-full text-center">{children}</div>
    </div>
  )

  if (!inv) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Einladung nicht gefunden</h1>
        <p className="text-sm text-[var(--color-ink-2)]">
          Dieser Einladungslink ist ungültig oder wurde bereits verwendet.
        </p>
      </Shell>
    )
  }

  if (inv.revoked_at) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Einladung zurückgezogen</h1>
        <p className="text-sm text-[var(--color-ink-2)]">
          Die Person, die dich eingeladen hat, hat den Link inzwischen zurückgezogen.
        </p>
      </Shell>
    )
  }

  if (new Date(inv.expires_at) < new Date()) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Einladung abgelaufen</h1>
        <p className="text-sm text-[var(--color-ink-2)]">
          Dieser Link ist abgelaufen. Bitte den HR-Verantwortlichen um eine neue Einladung.
        </p>
      </Shell>
    )
  }

  // Falls schon akzeptiert → direkt weiter zur Org
  if (inv.accepted_at) {
    if (user) {
      const { data: alreadyMember } = await supa
        .from('organization_members')
        .select('org_id')
        .eq('org_id', inv.org_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (alreadyMember) {
        redirect('/org')
      }
    }
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Bereits angenommen</h1>
        <p className="text-sm text-[var(--color-ink-2)]">
          Diese Einladung wurde bereits verwendet.{' '}
          {user ? (
            <Link href="/org" className="underline">Zu deinen Organisationen</Link>
          ) : (
            <Link href={`/login?next=/invite/${token}`} className="underline">Einloggen</Link>
          )}
        </p>
      </Shell>
    )
  }

  // Org-Name für die Anzeige
  const { data: org } = await supa
    .from('organizations').select('name').eq('id', inv.org_id).maybeSingle()
  const roleLabel = inv.role === 'hr_admin' ? 'HR-Admin' : 'Mitglied'

  if (!user) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Einladung in {org?.name ?? 'eine Organisation'}</h1>
        <p className="text-sm text-[var(--color-ink-2)] mb-6">
          Du wurdest als <strong>{roleLabel}</strong> eingeladen. Logge dich ein
          oder registriere dich — die Einladung wird danach automatisch eingelöst.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={`/login?next=/invite/${token}`}
            className="btn btn-primary"
          >
            Einloggen
          </Link>
          <Link
            href={`/signup?next=/invite/${token}`}
            className="btn btn-secondary"
          >
            Account erstellen
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold mb-2">Einladung in {org?.name ?? 'eine Organisation'}</h1>
      <p className="text-sm text-[var(--color-ink-2)] mb-6">
        Du wurdest als <strong>{roleLabel}</strong> eingeladen.
      </p>
      <AcceptInviteButton token={token} />
    </Shell>
  )
}
