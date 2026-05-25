import 'server-only'
import { serviceClient } from '@/lib/supabase/service'

/**
 * Komplette Verbergung bestimmter User-Accounts für ALLE Admin-Views.
 *
 * Use-Case: Test-Accounts, Founder-Accounts, oder Accounts die aus Privacy-
 * Gründen nicht in Admin-Dashboards erscheinen sollen. User und ihre Daten
 * werden NICHT gelöscht — sie funktionieren weiterhin normal, sind aber
 * für jeden Admin (auch dich) unsichtbar.
 *
 * Konfiguration:
 *  - Hardcoded Default: ein paar Accounts die immer hidden sind
 *  - Plus Env-Var ADMIN_HIDDEN_EMAILS (comma-separated) für später
 *
 * Cache: 60 Sekunden, damit nicht jede Admin-Page-Query nochmal die
 * profiles-Tabelle anpingt. Bei Settings-Änderung dauert's max 1 Min
 * bis der Cache invalidiert.
 */

const HARDCODED_HIDDEN_EMAILS: string[] = [
  'dreadflicker@gmail.com',
]

function getHiddenEmails(): string[] {
  const env = (process.env.ADMIN_HIDDEN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  return Array.from(new Set([...HARDCODED_HIDDEN_EMAILS.map(e => e.toLowerCase()), ...env]))
}

let cachedIds: Set<string> | null = null
let cacheExpiresAt = 0
const CACHE_TTL_MS = 60_000

/**
 * Liefert die Set<userId> aller Accounts die Admins NICHT sehen sollen.
 * Bei jeder Admin-Query: items.filter(x => !hidden.has(x.user_id)).
 */
export async function getHiddenUserIds(): Promise<Set<string>> {
  const now = Date.now()
  if (cachedIds && now < cacheExpiresAt) return cachedIds

  const emails = getHiddenEmails()
  if (emails.length === 0) {
    cachedIds = new Set()
    cacheExpiresAt = now + CACHE_TTL_MS
    return cachedIds
  }

  const supa = serviceClient()
  const { data, error } = await supa
    .from('profiles')
    .select('id')
    .in('email', emails)
  if (error) {
    console.error('[hidden-users] query failed', error)
    // Fail-safe: leerer Set damit Admin nichts kaputtes sieht
    return cachedIds ?? new Set()
  }

  cachedIds = new Set((data ?? []).map(r => r.id))
  cacheExpiresAt = now + CACHE_TTL_MS
  return cachedIds
}

/**
 * Convenience: ist diese eine ID versteckt? Nutzt den gleichen Cache.
 */
export async function isHiddenUserId(userId: string): Promise<boolean> {
  return (await getHiddenUserIds()).has(userId)
}

/**
 * Email-basierter Filter — für pre-auth Daten wie `leads` (User hat noch
 * keinen Account, kein user_id, aber wir wollen ihre Email auch filtern).
 * Returnt das normalisierte Set in lowercase.
 */
export function getHiddenEmailSet(): Set<string> {
  return new Set(getHiddenEmails())
}

export function isHiddenEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getHiddenEmailSet().has(email.trim().toLowerCase())
}
