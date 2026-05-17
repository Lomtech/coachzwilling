import 'server-only'
import { stripe } from '@/lib/stripe/client'
import { serviceClient } from '@/lib/supabase/service'
import type Stripe from 'stripe'

/**
 * Synchronisiert eine Stripe-Subscription in unsere `subscriptions`-Tabelle.
 * Idempotent — wird vom Webhook und vom Checkout-Success-Flow gerufen.
 */
export async function syncSubscriptionFromStripe(
  subscriptionId: string,
  userIdHint?: string
): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  })

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const userId = userIdHint ?? (await resolveUserId(customerId))
  if (!userId) {
    console.warn('[stripe-sync] kein user_id für customer', customerId)
    return
  }

  const item = sub.items.data[0]
  const subAny = sub as Stripe.Subscription & {
    current_period_end?: number | null
    trial_end?: number | null
    cancel_at_period_end?: boolean
  }
  const itemAny = item as Stripe.SubscriptionItem & { current_period_end?: number | null }
  const periodEnd = subAny.current_period_end ?? itemAny?.current_period_end ?? null
  const supa = serviceClient()
  await supa
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: item?.price.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subAny.cancel_at_period_end ?? false,
      trial_end: subAny.trial_end ? new Date(subAny.trial_end * 1000).toISOString() : null,
    })
}

async function resolveUserId(customerId: string): Promise<string | null> {
  const supa = serviceClient()
  const { data } = await supa
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (data?.user_id) return data.user_id

  // Fallback: Customer von Stripe holen, in metadata.user_id schauen
  const customer = await stripe().customers.retrieve(customerId)
  if ('metadata' in customer && customer.metadata?.user_id) {
    return customer.metadata.user_id
  }
  return null
}

/**
 * Stellt sicher, dass der User einen Stripe-Customer hat.
 * Nutzt die Subscription-Tabelle als Lookup.
 */
export async function ensureCustomer(params: {
  userId: string
  email: string
}): Promise<string> {
  const supa = serviceClient()
  const { data: existing } = await supa
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', params.userId)
    .maybeSingle()

  if (existing?.stripe_customer_id) return existing.stripe_customer_id

  const customer = await stripe().customers.create({
    email: params.email,
    metadata: { user_id: params.userId },
  })

  // Vorab-Insert mit Status "incomplete" — Webhook updated später.
  await supa.from('subscriptions').upsert({
    user_id: params.userId,
    stripe_customer_id: customer.id,
    status: 'incomplete',
  })

  return customer.id
}

export type StripeWebhookEvent = Stripe.Event
