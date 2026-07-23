import { NextResponse, type NextRequest } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { sendPasswordReset } from '@/lib/email/user-notify'

export const runtime = 'nodejs'

/**
 * Passwort-Reset anfordern — mit UNSEREM Absender.
 *
 * Warum nicht supabase.auth.resetPasswordForEmail()?
 * Das verschickt über Supabases eingebauten Mailer, also mit dessen
 * Standard-Absender und -Vorlage. Empfänger hielten das für Spam
 * (Nutzer-Feedback 2026-07-20). Stattdessen:
 *   1. admin.generateLink({type:'recovery'}) erzeugt NUR den Link (verschickt nichts)
 *   2. wir mailen ihn selbst via Resend als „Deepling <no-reply@deepling.de>"
 *
 * Datenschutz: die Antwort ist IMMER {ok:true} — sonst verrät der Endpunkt,
 * welche E-Mail-Adressen ein Konto haben (Account-Enumeration).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()

  // Nach außen immer dieselbe Antwort — egal ob Konto existiert oder nicht.
  const ok = () => NextResponse.json({ ok: true })

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ok()

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de').replace(/\/$/, '')
  const redirectTo = `${appUrl}/api/auth/callback?next=/reset-password`

  try {
    const supa = serviceClient()
    const { data, error } = await supa.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    // Unbekannte Adresse → still schlucken (kein Hinweis nach außen).
    if (error || !data?.properties?.action_link) {
      if (error) console.warn('[forgot-password] generateLink:', error.message)
      return ok()
    }

    const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined
    const name = (meta?.full_name || meta?.name || '').trim() || null

    const res = await sendPasswordReset({
      email,
      name,
      actionLink: data.properties.action_link,
    })
    void res
  } catch (e) {
    // Auch hier nach außen ok() — aber intern sichtbar machen.
    console.error('[forgot-password] failed', e)
  }

  return ok()
}
