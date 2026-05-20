import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin-auth'

export const runtime = 'nodejs'

/**
 * Diagnose-Endpoint: zeigt für eingeloggten User ob er Admin ist + warum/warum nicht.
 * Liefert NIE die volle Admin-Liste — nur die User-eigene Email + Status.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      hint: 'Nicht eingeloggt. Geh auf /login, dann probier nochmal.',
    })
  }

  const isAdmin = isAdminEmail(user.email)
  const adminListConfigured = !!process.env.ADMIN_EMAILS

  return NextResponse.json({
    authenticated: true,
    your_email: user.email,
    your_email_lowercased: user.email?.toLowerCase(),
    you_are_admin: isAdmin,
    admin_env_set: adminListConfigured,
    admin_env_includes_you: adminListConfigured
      ? (process.env.ADMIN_EMAILS ?? '')
          .split(',')
          .map(s => s.trim().toLowerCase())
          .includes((user.email ?? '').toLowerCase())
      : 'env not set, using code-fallback',
    hint: isAdmin
      ? 'Du bist Admin. Wenn du die Links nicht siehst: Cmd+Shift+R (Hard-Refresh), dann /admin direkt aufrufen.'
      : `Du bist KEIN Admin. Deine Email "${user.email}" ist nicht in ADMIN_EMAILS.`,
  })
}
