import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { isOrgAdmin } from '@/lib/org/auth'
import { ManageMembers } from './ManageMembers'
import { InviteForm } from './InviteForm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrgManagePage({ params }: PageProps) {
  const { id: orgId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/org/${orgId}/manage`)

  if (!(await isOrgAdmin(orgId))) notFound()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, k_anonymity_threshold, industry')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) notFound()

  // Members + Pending Invitations laden — via service client weil wir
  // Profile-Daten anderer User brauchen (RLS würde nur eigene zeigen).
  const supa = serviceClient()
  const [{ data: members }, { data: pendingInvites }, { data: callerMembership }] = await Promise.all([
    supa.from('organization_members')
      .select('user_id, role, joined_at, profiles!inner(email, full_name)')
      .eq('org_id', orgId)
      .order('joined_at', { ascending: true }),
    supa.from('org_invitations')
      .select('id, email, role, invited_at, expires_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('invited_at', { ascending: false }),
    supa.from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const callerIsOwner = callerMembership?.role === 'owner'

  const memberRows = (members ?? []).map(m => {
    const p = m.profiles as unknown as { email: string; full_name: string | null }
    return {
      userId: m.user_id,
      email: p.email,
      fullName: p.full_name,
      role: m.role as 'owner' | 'hr_admin' | 'member',
      joinedAt: m.joined_at,
    }
  })

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-1">
              Verwaltung
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{org.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/org/${org.id}/dashboard`}
              className="btn btn-ghost text-sm"
            >
              HR-Dashboard →
            </Link>
            <Link href="/org" className="btn btn-ghost text-sm">← Orgs</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        <section className="card p-5">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-[var(--color-muted)]">Mitarbeitende</div>
              <div className="font-semibold tabular-nums">
                {memberRows.filter(m => m.role === 'member').length}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">HR-Admins / Owner</div>
              <div className="font-semibold tabular-nums">
                {memberRows.filter(m => m.role !== 'member').length}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">K-Anonymitäts-Schwelle</div>
              <div className="font-semibold tabular-nums">≥ {org.k_anonymity_threshold}</div>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold mb-3">Neue Person einladen</h2>
          <InviteForm orgId={org.id} />
        </section>

        {pendingInvites && pendingInvites.length > 0 && (
          <section className="card p-5">
            <h2 className="font-semibold mb-3">Offene Einladungen</h2>
            <ul className="divide-y divide-[var(--color-border)]">
              {pendingInvites.map(inv => (
                <PendingInviteRow
                  key={inv.id}
                  orgId={org.id}
                  invitationId={inv.id}
                  email={inv.email}
                  role={inv.role as 'member' | 'hr_admin'}
                  invitedAt={inv.invited_at}
                  expiresAt={inv.expires_at}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="card p-5">
          <h2 className="font-semibold mb-3">Mitglieder</h2>
          <ManageMembers
            orgId={org.id}
            currentUserId={user.id}
            callerIsOwner={callerIsOwner}
            members={memberRows}
          />
        </section>
      </main>
    </div>
  )
}

import { RevokeInviteButton } from './RevokeInviteButton'

function PendingInviteRow({
  orgId,
  invitationId,
  email,
  role,
  invitedAt,
  expiresAt,
}: {
  orgId: string
  invitationId: string
  email: string
  role: 'member' | 'hr_admin'
  invitedAt: string
  expiresAt: string
}) {
  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{email}</div>
        <div className="text-xs text-[var(--color-muted)]">
          {role === 'hr_admin' ? 'HR-Admin' : 'Mitglied'} ·
          eingeladen {formatRelativeDe(invitedAt)} · gültig bis{' '}
          {new Date(expiresAt).toLocaleDateString('de-DE')}
        </div>
      </div>
      <RevokeInviteButton orgId={orgId} invitationId={invitationId} />
    </li>
  )
}

function formatRelativeDe(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days < 1) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  return new Date(iso).toLocaleDateString('de-DE')
}
