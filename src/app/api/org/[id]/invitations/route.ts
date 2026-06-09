import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { isOrgAdmin } from '@/lib/org/auth'
import { sendOrgInviteMail } from '@/lib/org/invite-mail'

export const runtime = 'nodejs'

// POST /api/org/[id]/invitations — { email, role }
//
// Legt eine Einladung an + verschickt eine Mail mit Accept-Link.
// Nur owner / hr_admin der Org dürfen das.
//
// Idempotenz: wenn für (org, email) bereits eine offene unrevoked-Invitation
// existiert, geben wir die zurück statt eine neue anzulegen — der Caller
// kann dann die alte resenden oder revoken+neu.

interface InviteBody {
  email?: string
  role?: 'member' | 'hr_admin'
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isOrgAdmin(orgId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as InviteBody | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Ungültige E-Mail' }, { status: 400 })
  }
  const role = body?.role === 'hr_admin' ? 'hr_admin' : 'member'

  const supa = serviceClient()

  // Org-Name + Inviter-Name für Mail-Body
  const [orgRes, profileRes] = await Promise.all([
    supa.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    supa.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
  ])
  if (!orgRes.data) return NextResponse.json({ error: 'org not found' }, { status: 404 })

  // Falls Eingeladener bereits Member ist → 409
  const { data: existingMember } = await supa
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id',
      (await supa.from('profiles').select('id').eq('email', email)).data?.map(p => p.id) ?? ['00000000-0000-0000-0000-000000000000']
    )
    .maybeSingle()
  if (existingMember) {
    return NextResponse.json({ error: 'Person ist bereits Mitglied' }, { status: 409 })
  }

  // Vorhandene offene Invite? → reusen statt duplizieren
  const { data: pending } = await supa
    .from('org_invitations')
    .select('id, token, expires_at')
    .eq('org_id', orgId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  let invitation = pending
  if (!invitation) {
    const token = randomBytes(24).toString('base64url')
    const { data: ins, error: insErr } = await supa
      .from('org_invitations')
      .insert({
        org_id: orgId,
        email,
        role,
        token,
        invited_by: user.id,
      })
      .select('id, token, expires_at')
      .single()
    if (insErr || !ins) {
      return NextResponse.json({ error: insErr?.message ?? 'invite failed' }, { status: 500 })
    }
    invitation = ins
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const acceptUrl = `${appUrl}/invite/${invitation.token}`

  const mailRes = await sendOrgInviteMail({
    to: email,
    orgName: orgRes.data.name,
    inviterName: profileRes.data?.full_name ?? null,
    inviterEmail: profileRes.data?.email ?? user.email ?? 'team@coachzwilling.com',
    role,
    acceptUrl,
    expiresAt: new Date(invitation.expires_at),
  })

  return NextResponse.json({
    ok: true,
    invitationId: invitation.id,
    emailSent: mailRes.ok,
    emailError: mailRes.ok ? null : mailRes.error,
  })
}
