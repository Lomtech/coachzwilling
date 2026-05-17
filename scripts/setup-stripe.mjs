#!/usr/bin/env node
// Idempotentes Stripe-Setup für Coaching-Zwilling.
// Legt 1 Produkt + 2 Preise (monatlich + jährlich) an. Re-Runs bleiben safe.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs --webhook https://meine-domain/api/stripe/webhook

import Stripe from 'stripe'

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('❌ STRIPE_SECRET_KEY fehlt. Setze ihn z.B. mit: export STRIPE_SECRET_KEY=sk_test_...')
  process.exit(1)
}

const args = process.argv.slice(2)
const webhookIdx = args.indexOf('--webhook')
const webhookUrl = webhookIdx >= 0 ? args[webhookIdx + 1] : null

const stripe = new Stripe(KEY)

const PRODUCT_LOOKUP = 'coaching-zwilling'
const MONTHLY_LOOKUP = 'coaching-zwilling-monthly'
const YEARLY_LOOKUP  = 'coaching-zwilling-yearly'
const TEST_LOOKUP    = 'coaching-zwilling-test'

async function main() {
  // ── Produkt finden oder anlegen ────────────────────────────────────────────
  let product
  const productSearch = await stripe.products.search({
    query: `metadata['lookup']:'${PRODUCT_LOOKUP}'`,
  })
  if (productSearch.data.length > 0) {
    product = productSearch.data[0]
    console.log(`✓ Produkt existiert: ${product.id}`)
  } else {
    product = await stripe.products.create({
      name: 'Coaching-Zwilling',
      description: 'Personalisierter KI-Coach für Führungskräfte',
      metadata: { lookup: PRODUCT_LOOKUP },
    })
    console.log(`+ Produkt angelegt: ${product.id}`)
  }

  // ── Preise (über lookup_key idempotent) ────────────────────────────────────
  const monthly = await ensurePrice({
    lookupKey: MONTHLY_LOOKUP,
    productId: product.id,
    amount: 2900,
    interval: 'month',
    nickname: 'Monthly 29 EUR',
  })
  const yearly = await ensurePrice({
    lookupKey: YEARLY_LOOKUP,
    productId: product.id,
    amount: 22800,
    interval: 'year',
    nickname: 'Yearly 228 EUR (= 19 EUR/mo)',
  })
  const test = await ensurePrice({
    lookupKey: TEST_LOOKUP,
    productId: product.id,
    amount: 100,
    interval: 'month',
    nickname: 'TEST 1 EUR/mo (E2E-Smoke, kein Trial)',
  })

  // ── Webhook (optional) ─────────────────────────────────────────────────────
  let webhookSecret = null
  if (webhookUrl) {
    const wh = await ensureWebhook(webhookUrl)
    webhookSecret = wh.secret
    console.log(`✓ Webhook-Endpoint: ${wh.id}`)
  }

  // ── Output für Vercel ──────────────────────────────────────────────────────
  console.log('\n══════════ Env-Variablen (in Vercel eintragen) ══════════')
  console.log(`STRIPE_PRICE_MONTHLY=${monthly.id}`)
  console.log(`STRIPE_PRICE_YEARLY=${yearly.id}`)
  console.log(`STRIPE_PRICE_TEST=${test.id}`)
  if (webhookSecret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`)
  } else {
    console.log('(STRIPE_WEBHOOK_SECRET kommt nach erstem Production-Deploy.')
    console.log(' Re-run mit --webhook https://<deine-domain>/api/stripe/webhook)')
  }
  console.log('═════════════════════════════════════════════════════════\n')
}

async function ensurePrice({ lookupKey, productId, amount, interval, nickname }) {
  const search = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })
  if (search.data.length > 0) {
    const p = search.data[0]
    console.log(`✓ Preis existiert (${interval}): ${p.id} → ${(p.unit_amount/100).toFixed(2)} ${p.currency.toUpperCase()}`)
    return p
  }
  const created = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: 'eur',
    recurring: { interval },
    lookup_key: lookupKey,
    nickname,
  })
  console.log(`+ Preis angelegt (${interval}): ${created.id}`)
  return created
}

async function ensureWebhook(url) {
  const list = await stripe.webhookEndpoints.list({ limit: 100 })
  const existing = list.data.find(w => w.url === url)
  if (existing) return existing
  return await stripe.webhookEndpoints.create({
    url,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed',
      'customer.subscription.trial_will_end',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
    ],
  })
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
