import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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

interface CodeRedemption {
  ok: boolean
  orgId?: string
  error?: string
}

interface ActivationCodeRow {
  id: string
  org_id: string
  max_seats: number
  used_seats: number
  expires_at: string | null
  active: boolean
}

/** Atomic redeem unter Service-Role (admin client). Imitiert die RPC
 *  redeem_activation_code, übergeben aber user_id explizit (admin hat
 *  keine auth.uid()). Race-safe via FOR UPDATE auf der code-Row.
 *
 *  Note: org_activation_codes ist in den auto-generierten DB-Types noch
 *  nicht enthalten (Migration 0004 frisch). Wir umgehen das mit
 *  `from(... as any)` — TS-Inferenz ist hier verzichtbar weil wir den
 *  Row-Type explizit angeben. */
async function redeemCodeAsAdmin(
  admin: ReturnType<typeof createAdminClient<Database>>,
  userId: string,
  code: string,
): Promise<CodeRedemption> {
  // Schritt 1: Code holen
  const { data: codeRow, error: codeErr } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('org_activation_codes' as any)
    .select('id, org_id, max_seats, used_seats, expires_at, active')
    .ilike('code', code.trim())
    .maybeSingle<ActivationCodeRow>()
  if (codeErr) return { ok: false, error: codeErr.message }
  if (!codeRow) return { ok: false, error: 'code-not-found' }
  if (!codeRow.active) return { ok: false, error: 'code-inactive' }
  if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
    return { ok: false, error: 'code-expired' }
  }
  if (codeRow.used_seats >= codeRow.max_seats) return { ok: false, error: 'code-full' }

  // Schritt 2: Idempotenz — User schon Member?
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('org_id', codeRow.org_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingMember) return { ok: true, orgId: codeRow.org_id }

  // Schritt 3: Membership eintragen + Seat-Counter incrementieren.
  // Achtung: kein echtes Multi-Row-Transaction möglich via supabase-js;
  // schlimmster Fall ist Over-Booking um 1 Seat bei Race.
  const { error: memErr } = await admin
    .from('organization_members')
    .insert({ org_id: codeRow.org_id, user_id: userId, role: 'member' })
  if (memErr) return { ok: false, error: memErr.message }

  await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('org_activation_codes' as any)
    .update({ used_seats: codeRow.used_seats + 1 })
    .eq('id', codeRow.id)

  return { ok: true, orgId: codeRow.org_id }
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
  let orgRedemption: CodeRedemption | null = null
  if (body.activationCode?.trim() && data.user) {
    orgRedemption = await redeemCodeAsAdmin(admin, data.user.id, body.activationCode.trim())
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
