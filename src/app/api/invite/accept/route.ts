import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// POST /api/invite/accept — { token }
//
// Erfolgsfall: User wird als organization_members eingefügt, Invitation
// als accepted markiert, { ok, orgId, orgSlug } zurückgegeben.
//
// Edge-Cases:
//   • Token unbekannt / expired / revoked       → 410
//   • User schon Member (Doppel-Klick auf Mail) → 200 (idempotent)
//   • Token gehört zu anderer E-Mail            → akzeptieren wir trotzdem,
//     weil HR-Mailweiterleitungen üblich sind. Token ist secret genug.

interface AcceptBody {
  token?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as AcceptBody | null
  const token = body?.token?.trim()
  if (!token) return NextResponse.json({ error: 'token fehlt' }, { status: 400 })

  const supa = serviceClient()
  const { data: inv } = await supa
    .from('org_invitations')
    .select('id, org_id, role, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!inv) return NextResponse.json({ error: 'Einladung nicht gefunden' }, { status: 410 })
  if (inv.revoked_at) return NextResponse.json({ error: 'Einladung zurückgezogen' }, { status: 410 })
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Einladung abgelaufen' }, { status: 410 })
  }

  // Schon Mitglied? → idempotent
  const { data: existing } = await supa
    .from('organization_members')
    .select('role')
    .eq('org_id', inv.org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) {
    const { data: org } = await supa
      .from('organizations').select('slug').eq('id', inv.org_id).maybeSingle()
    return NextResponse.json({ ok: true, orgId: inv.org_id, orgSlug: org?.slug ?? null, already: true })
  }

  const { error: memErr } = await supa
    .from('organization_members')
    .insert({ org_id: inv.org_id, user_id: user.id, role: inv.role })
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  // Invitation als accepted markieren (best-effort — wenn das fehlschlägt,
  // ist die Mitgliedschaft trotzdem aktiv).
  await supa
    .from('org_invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inv.id)

  const { data: org } = await supa
    .from('organizations').select('slug').eq('id', inv.org_id).maybeSingle()

  return NextResponse.json({ ok: true, orgId: inv.org_id, orgSlug: org?.slug ?? null })
}
