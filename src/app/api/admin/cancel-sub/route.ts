import { NextResponse, type NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-shot Admin-Endpoint: setzt cancel_at_period_end=true für eine Stripe-Sub.
 *
 * Auth: secret-Query-Param (NICHT Session-Auth, weil wir das vom Terminal aus
 * triggern wollen). Secret wird in Vercel als ADMIN_CANCEL_SECRET gehalten.
 *
 * Wird nach einmaligem Gebrauch wieder aus dem Repo entfernt.
 *
 *   curl -X POST "https://deepling.de/api/admin/cancel-sub?s=<SECRET>&sub=sub_xxx"
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('s')
  const subId = url.searchParams.get('sub')
  const expected = process.env.ADMIN_CANCEL_SECRET
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!subId || !subId.startsWith('sub_')) {
    return NextResponse.json({ error: 'sub query param required (sub_…)' }, { status: 400 })
  }
  try {
    const result = await stripe().subscriptions.update(subId, {
      cancel_at_period_end: true,
    })
    const r = result as unknown as {
      id: string; status: string;
      cancel_at_period_end: boolean; current_period_end?: number;
    }
    return NextResponse.json({
      ok: true,
      id: r.id,
      status: r.status,
      cancel_at_period_end: r.cancel_at_period_end,
      current_period_end: r.current_period_end,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
