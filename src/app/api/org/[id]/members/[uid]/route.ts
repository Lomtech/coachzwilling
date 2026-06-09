import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { isOrgAdmin } from '@/lib/org/auth'

export const runtime = 'nodejs'

// PATCH /api/org/[id]/members/[uid] — { role: 'member' | 'hr_admin' | 'owner' }
// Nur Owner darf Rollen ändern. Mindestens 1 Owner muss übrig bleiben.

interface PatchBody {
  role?: 'member' | 'hr_admin' | 'owner'
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; uid: string }> },
) {
  const { id: orgId, uid } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Owner-Check (strenger als isOrgAdmin)
  const supa = serviceClient()
  const { data: callerMembership } = await supa
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (callerMembership?.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden — only owner can change roles' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  const newRole = body?.role
  if (newRole !== 'member' && newRole !== 'hr_admin' && newRole !== 'owner') {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 })
  }

  // Wenn ein Owner-Downgrade gemacht wird → muss noch mind. 1 anderer Owner da sein
  if (newRole !== 'owner') {
    const { data: target } = await supa
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', uid)
      .maybeSingle()
    if (target?.role === 'owner') {
      const { count } = await supa
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'owner')
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Mindestens 1 Owner muss bleiben' }, { status: 409 })
      }
    }
  }

  const { error } = await supa
    .from('organization_members')
    .update({ role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/org/[id]/members/[uid] — Mitglied entfernen
//   • Owner darf jeden entfernen (außer letzten Owner — Constraint wie oben)
//   • Member darf sich selbst entfernen
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; uid: string }> },
) {
  const { id: orgId, uid } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supa = serviceClient()

  const isSelfRemove = user.id === uid
  if (!isSelfRemove) {
    const isAdmin = await isOrgAdmin(orgId)
    const { data: callerMembership } = await supa
      .from('organization_members').select('role').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
    if (!isAdmin && callerMembership?.role !== 'owner') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  // Last-owner-guard
  const { data: target } = await supa
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', uid)
    .maybeSingle()
  if (target?.role === 'owner') {
    const { count } = await supa
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Mindestens 1 Owner muss bleiben' }, { status: 409 })
    }
  }

  const { error } = await supa
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
