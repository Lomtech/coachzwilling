import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { redeemActivationCode } from '@/lib/org/redeem'

export const runtime = 'nodejs'

/**
 * Unternehmenscode nachträglich einlösen — für BEREITS eingeloggte User.
 *
 * Anwendungsfälle:
 *   • Bestehender User klickt einen B2B-Code-Link → /join/[code] löst hierüber ein
 *   • User trägt einen Code in den Einstellungen nach
 *
 * Auth: echte Session (createClient). Nur der eingeloggte User kann für sich
 * selbst einlösen — die userId kommt aus der Session, nie aus dem Body.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { code?: string } | null
  const code = body?.code?.trim()
  if (!code) return NextResponse.json({ ok: false, error: 'code-required' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'service not configured' }, { status: 500 })
  }
  const admin = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await redeemActivationCode(admin, user.id, code)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
