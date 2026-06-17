import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { redeemActivationCode, type RedeemResult } from '@/lib/org/redeem'

export const runtime = 'nodejs'

/**
 * Server-Side-Signup mit Auto-Confirm.
 *
 * Warum nicht supabase.auth.signUp aus dem Browser?
 * - Standard-Signup setzt email_confirmed_at = null und verlangt dass User
 *   die Confirmation-Mail klickt bevor er einloggen kann.
 * - Mails landen oft im Spam ODER User klickt nicht ODER Mail kommt verzögert.
 *   Effekt: User probiert sofort danach Login → "email not confirmed" → Frust.
 *
 * Dieser Endpoint:
 * 1. Erstellt den User via admin.createUser MIT email_confirm: true
 *    (umgeht die Confirmation-Mail komplett)
 * 2. Client kann direkt danach signInWithPassword → klappt sofort
 *
 * Sicherheit:
 * - Service-Role-Key bleibt server-side (nie zum Client)
 * - Password-Mindeststandard wird Supabase-seitig geprüft
 * - Rate-Limiting: bei missbräuchlicher Nutzung würden wir später noch
 *   Captcha/Rate-Limit auf diese Route legen
 *
 * Spam-Risiko: gering, weil
 * - Account ohne Stripe-Sub kein chat-Zugriff (Billing-Gate)
 * - Email-Confirmation kann später jederzeit wieder aktiviert werden falls nötig
 */

interface Body {
  email?: string
  password?: string
  fullName?: string
  /**
   * Optional: Org-Activation-Code (z.B. "DEEPLING-ACME-7B3K").
   * Wenn übergeben, wird der User direkt als 'member' der zugehörigen Org
   * eingetragen und kann den Coach ohne Stripe-Sub nutzen.
   */
  activationCode?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.email?.trim() || !body?.password) {
    return NextResponse.json({ error: 'email + password required' }, { status: 400 })
  }
  const email = body.email.trim().toLowerCase()
  const password = body.password
  const fullName = body.fullName?.trim() || null

  // Basics: Format + Length-Check, bevor wir Supabase belasten
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 chars' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'auth service not configured' }, { status: 500 })
  }

  const admin = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // ← Schlüssel-Trick: User ist sofort confirmed
    user_metadata: fullName ? { full_name: fullName } : undefined,
  })

  if (error) {
    // Typischer Fall: Email schon registriert
    if (/already (registered|exists)|duplicate/i.test(error.message)) {
      return NextResponse.json({ error: 'email-already-exists' }, { status: 409 })
    }
    console.error('[auth/signup] createUser failed', error)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // profiles-Row anlegen (falls Trigger es nicht ohnehin tut — Defensive)
  if (data.user) {
    await admin
      .from('profiles')
      .upsert({
        id: data.user.id,
        email,
        full_name: fullName,
      }, { onConflict: 'id' })
  }

  // Optional: Org-Code einlösen (B2B-Bulk-Activation).
  // Fehler bei Code-Redeem brechen den Signup NICHT ab — User ist trotzdem
  // angelegt, kann später Code via /api/org/redeem nachreichen.
  let orgRedemption: RedeemResult | null = null
  if (body.activationCode?.trim() && data.user) {
    orgRedemption = await redeemActivationCode(admin, data.user.id, body.activationCode.trim())
    if (!orgRedemption.ok) {
      console.warn('[auth/signup] org code redeem failed', orgRedemption.error)
    }
  }

  return NextResponse.json({
    ok: true,
    userId: data.user?.id,
    org: orgRedemption,
  })
}
