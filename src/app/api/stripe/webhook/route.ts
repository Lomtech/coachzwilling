import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { syncSubscriptionFromStripe } from '@/lib/stripe/sync'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 })
  }

  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: `bad signature: ${msg}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.subscription && typeof session.subscription === 'string') {
          const userId = session.metadata?.user_id ?? undefined
          await syncSubscriptionFromStripe(session.subscription, userId)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object
        await syncSubscriptionFromStripe(sub.id)
        break
      }
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed': {
        // In neueren Stripe-SDKs sitzt die subscription-id unter parent.subscription_details.
        // Wir nehmen den ersten line-item als Fallback.
        const invoice = event.data.object as Stripe.Invoice & {
          parent?: { subscription_details?: { subscription?: string | null } }
        }
        const subId =
          invoice.parent?.subscription_details?.subscription ??
          (invoice.lines.data[0] as Stripe.InvoiceLineItem & { subscription?: string | null })?.subscription ??
          null
        if (subId && typeof subId === 'string') {
          await syncSubscriptionFromStripe(subId)
        }
        break
      }
    }
  } catch (e) {
    console.error('[stripe-webhook]', event.type, e)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
