import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin-Whitelist via ADMIN_EMAILS env (Komma-separiert).
 * Default-Admins für Notfall hartkodiert.
 */
function adminEmailList(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.length > 0) return fromEnv
  // Notfall-Fallback wenn Env nicht gesetzt
  return [
    'lomaliimadaev@gmail.com',
    'mm@denkhorizonte.de',
    'michaelmueller2305@googlemail.com',
  ]
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmailList().includes(email.toLowerCase())
}

/**
 * Server-Side Helper: für /admin/*-Seiten. Redirected zu /login wenn nicht
 * eingeloggt, zu / wenn eingeloggt aber kein Admin.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')
  if (!isAdminEmail(user.email)) redirect('/')
  return user
}
