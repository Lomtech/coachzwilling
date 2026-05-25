import { type NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/email/tokens'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * Click-Handler für Follow-up-Email-CTAs.
 * URL: /api/followups/click/<signed-token>
 *
 * Flow:
 * 1. Token verifizieren (HMAC + Expiry)
 * 2. clicked_at in DB setzen (für Stats)
 * 3. Redirect zum Coach mit ?followup=<followupId> Query-Param
 *    → /coach Page erkennt den Param, lädt die Follow-up-Email,
 *      startet eine neue Conversation in der die Email als erster
 *      Coach-Turn vorgefüllt ist
 *
 * Auth: KEINE — Click kommt direkt aus dem Mail-Client, der User hat
 * keinen aktiven Cookie. Login-Check passiert dann auf /coach.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const payload = verifyToken(token)
  if (!payload || payload.purpose !== 'click') {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 400 })
  }

  const supa = serviceClient()

  // Click loggen (idempotent: erstmaliger Click setzt clicked_at, später nicht überschreiben)
  await supa
    .from('email_followups')
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', payload.followupId)
    .is('clicked_at', null)

  // Redirect zum Coach mit Follow-up-Hinweis
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '')
  const target = `${baseUrl}/coach?followup=${encodeURIComponent(payload.followupId)}`
  return NextResponse.redirect(target, 302)
}
