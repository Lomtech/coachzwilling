import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from '@/components/auth/SetPasswordForm'

export const dynamic = 'force-dynamic'

/**
 * Ziel des Passwort-Reset-Links. Nach dem Klick hat der User über
 * /api/auth/callback eine (Recovery-)Session — hier setzt er sein neues
 * Passwort. Anschließend geht's in den Coach.
 *
 * Ohne Session (Link direkt aufgerufen / abgelaufen) zeigen wir einen
 * Hinweis + Weg zum neuen Link, statt eines leeren Formulars.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Passwort setzen</h1>

      {user ? (
        <>
          <p className="text-[var(--color-ink-2)] mb-6">
            Wähle ein neues Passwort für <strong>{user.email}</strong>. Damit kannst du dich künftig direkt anmelden.
          </p>
          <SetPasswordForm redirectAfter="/coach" submitLabel="Passwort setzen & weiter" />
        </>
      ) : (
        <>
          <p className="text-[var(--color-ink-2)] mb-6">
            Dieser Link ist abgelaufen oder wurde bereits verwendet. Fordere einen neuen an.
          </p>
          <Link href="/forgot-password" className="btn btn-primary btn-block">
            Neuen Reset-Link anfordern
          </Link>
        </>
      )}

      <div className="mt-5 text-sm text-[var(--color-muted)]">
        <Link href="/login" className="text-[var(--color-ink)] underline">Zurück zum Login</Link>
      </div>
    </div>
  )
}
