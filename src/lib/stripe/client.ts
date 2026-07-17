import 'server-only'
import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY fehlt')
    _stripe = new Stripe(key)
  }
  return _stripe
}

export const PRICE_IDS = {
  monthly: () => required('STRIPE_PRICE_MONTHLY'),
  yearly: () => required('STRIPE_PRICE_YEARLY'),
  test: () => required('STRIPE_PRICE_TEST'),
  /** 149-€-Einmalzahlung: schaltet Teil 2 + Vollprofil frei (mode:'payment'). */
  full: () => required('STRIPE_PRICE_FULL'),
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} fehlt`)
  return v
}
