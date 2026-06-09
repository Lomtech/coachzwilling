import { NextResponse, type NextRequest } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { isOrgAdmin } from '@/lib/org/auth'

export const runtime = 'nodejs'

// DELETE /api/org/[id]/invitations/[invId] — Einladung widerrufen
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; invId: string }> },
) {
  const { id: orgId, invId } = await ctx.params

  if (!(await isOrgAdmin(orgId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const supa = serviceClient()
  const { error } = await supa
    .from('org_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invId)
    .eq('org_id', orgId)
    .is('accepted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
