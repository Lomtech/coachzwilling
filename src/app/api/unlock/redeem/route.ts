import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * Freischalt-Code für die Vollanalyse einlösen — für den EINGELOGGTEN User.
 *
 * Alternative zum 149-€-Kauf: der Coach gibt Klienten Einzel-Codes. Einlösen
 * setzt profiles.full_unlocked=true (schaltet Teil 2 frei) via atomarem RPC
 * `redeem_unlock_code` (FOR UPDATE gegen Doppel-Einlösung).
 *
 * Auth: echte Session. Die userId kommt aus der Session, NIE aus dem Body.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { code?: string } | null
  const code = body?.code?.trim()
  if (!code) return NextResponse.json({ ok: false, error: 'code-required' }, { status: 400 })

  const supa = serviceClient()
  const { data, error } = await (supa as any).rpc('redeem_unlock_code', {
    p_code: code,
    p_user_id: user.id,
  })

  if (error) {
    console.error('[unlock/redeem] rpc error', error)
    return NextResponse.json({ ok: false, error: 'server-error' }, { status: 500 })
  }

  const result = (data ?? { ok: false, error: 'server-error' }) as {
    ok: boolean; error?: string; already?: boolean
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
