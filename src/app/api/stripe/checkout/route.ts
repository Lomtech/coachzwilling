import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, PRICE_IDS } from '@/lib/stripe/client'
import { ensureCustomer } from '@/lib/stripe/sync'

export const runtime = 'nodejs'

interface Body {
  plan: 'monthly' | 'yearly' | 'test'
}

function isDemoUser(email: string | null | undefined): boolean {
  if (!email) return false
  if (process.env.DEMO_MODE !== 'true') return false
  const allowed = (process.env.DEMO_USER_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
  return allowed.includes(email.toLowerCase())
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as Body | null
  let plan: 'monthly' | 'yearly' | 'test' = 'monthly'
  if (body?.plan === 'yearly') plan = 'yearly'
  else if (body?.plan === 'test') plan = 'test'

  // Test-Plan nur für whitelisted Demo-Emails erlauben
  if (plan === 'test' && !isDemoUser(user.email)) {
    return NextResponse.json({ error: 'test plan not available' }, { status: 403 })
  }

  const priceId =
    plan === 'yearly' ? PRICE_IDS.yearly() :
    plan === 'test'   ? PRICE_IDS.test()   :
                        PRICE_IDS.monthly()

  const customerId = await ensureCustomer({ userId: user.id, email: user.email })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin

  // Test-Plan ohne Trial → echter Charge → echter Webhook-Test.
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: plan === 'test'
      ? { metadata: { user_id: user.id } }
      : { trial_period_days: 7, metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing`,
    metadata: { user_id: user.id, plan },
  })

  return NextResponse.json({ url: session.url })
}
