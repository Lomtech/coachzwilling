import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * Erzeugt (oder rotiert) den Share-Token für das aktive Coach-Profil des Users.
 * Token ist URL-sicher und sehr kurz lesbar (~22 Zeichen).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { rotate?: boolean }
  const supa = serviceClient()

  // Aktives Profil holen
  const { data: cp } = await supa
    .from('coach_profiles')
    .select('id, share_token, share_enabled')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cp) {
    return NextResponse.json({ error: 'kein aktives Profil' }, { status: 404 })
  }

  let token = cp.share_token
  if (!token || body.rotate) {
    token = randomBytes(16).toString('base64url') // ~22 Zeichen URL-safe
  }

  const { error } = await supa
    .from('coach_profiles')
    .update({
      share_token: token,
      share_enabled: true,
      share_created_at: new Date().toISOString(),
    })
    .eq('id', cp.id)

  if (error) {
    console.error('[share] enable failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, token })
}

/**
 * Deaktiviert den Share-Link (Token bleibt in DB für Audit, ist aber tot).
 */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supa = serviceClient()
  const { error } = await supa
    .from('coach_profiles')
    .update({ share_enabled: false })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
