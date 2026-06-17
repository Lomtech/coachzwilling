import 'server-only'
import type { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Zentrale Einlöse-Logik für B2B-Unternehmenscodes (org_activation_codes).
 *
 * Wird von ZWEI Pfaden genutzt:
 *   1. Signup (neuer Mitarbeiter registriert sich mit Code) — /api/auth/signup
 *   2. Redeem (bestehender User löst Code nachträglich ein) — /api/org/redeem
 *
 * Beide nutzen denselben Service-Role-Admin-Client und übergeben die userId
 * explizit (statt auf eine DB-RPC mit auth.uid() zu setzen), damit der Pfad
 * für eingeloggte UND frisch-erstellte User identisch ist.
 *
 * Race-Sicherheit: kein echtes Multi-Row-Transaction über supabase-js möglich.
 * Schlimmster Fall ist eine Über-Buchung um 1 Seat bei exakt gleichzeitigem
 * Redeem — akzeptabel für die Zielgröße (Teams < 100). Die Idempotenz-Prüfung
 * (User schon Member?) verhindert Doppel-Einlösung durch denselben User.
 */

export type RedeemErrorCode =
  | 'code-not-found'
  | 'code-inactive'
  | 'code-expired'
  | 'code-full'
  | 'db-error'

export interface RedeemResult {
  ok: boolean
  orgId?: string
  orgName?: string
  alreadyMember?: boolean
  error?: RedeemErrorCode
  errorDetail?: string
}

interface ActivationCodeRow {
  id: string
  org_id: string
  max_seats: number
  used_seats: number
  expires_at: string | null
  active: boolean
}

/** Benutzerfreundliche deutsche Texte zu jedem Fehlercode. Wird in UI + Mail
 *  wiederverwendet, damit die Formulierung an einer Stelle gepflegt wird. */
export const REDEEM_ERROR_TEXT: Record<RedeemErrorCode, string> = {
  'code-not-found': 'Diesen Unternehmenscode kennen wir nicht. Bitte prüfe die Schreibweise oder frag deinen Ansprechpartner.',
  'code-inactive': 'Dieser Code wurde deaktiviert. Bitte wende dich an deinen Ansprechpartner.',
  'code-expired': 'Dieser Code ist abgelaufen. Bitte fordere einen neuen bei deinem Ansprechpartner an.',
  'code-full': 'Alle Plätze für diesen Code sind bereits vergeben. Bitte wende dich an deinen Ansprechpartner.',
  'db-error': 'Beim Einlösen ist ein technischer Fehler aufgetreten. Bitte versuche es später noch einmal.',
}

export async function redeemActivationCode(
  admin: ReturnType<typeof createAdminClient<Database>>,
  userId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const code = rawCode.trim()
  if (!code) return { ok: false, error: 'code-not-found' }

  // Schritt 1: Code laden (case-insensitive)
  const { data: codeRow, error: codeErr } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('org_activation_codes' as any)
    .select('id, org_id, max_seats, used_seats, expires_at, active')
    .ilike('code', code)
    .maybeSingle<ActivationCodeRow>()
  if (codeErr) return { ok: false, error: 'db-error', errorDetail: codeErr.message }
  if (!codeRow) return { ok: false, error: 'code-not-found' }
  if (!codeRow.active) return { ok: false, error: 'code-inactive' }
  if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
    return { ok: false, error: 'code-expired' }
  }

  // Org-Name für die Bestätigungs-UX laden (best effort)
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', codeRow.org_id)
    .maybeSingle()
  const orgName = (org as { name?: string } | null)?.name

  // Schritt 2: Idempotenz — User schon Member dieser Org?
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('org_id', codeRow.org_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingMember) {
    return { ok: true, orgId: codeRow.org_id, orgName, alreadyMember: true }
  }

  // Seat-Check erst NACH der Idempotenz-Prüfung: ein bereits eingelöster User
  // soll auch dann durchkommen, wenn der Code zwischenzeitlich voll wurde.
  if (codeRow.used_seats >= codeRow.max_seats) return { ok: false, error: 'code-full' }

  // Schritt 3: Membership eintragen + Seat-Counter erhöhen
  const { error: memErr } = await admin
    .from('organization_members')
    .insert({ org_id: codeRow.org_id, user_id: userId, role: 'member' })
  if (memErr) return { ok: false, error: 'db-error', errorDetail: memErr.message }

  await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('org_activation_codes' as any)
    .update({ used_seats: codeRow.used_seats + 1 })
    .eq('id', codeRow.id)

  return { ok: true, orgId: codeRow.org_id, orgName, alreadyMember: false }
}
