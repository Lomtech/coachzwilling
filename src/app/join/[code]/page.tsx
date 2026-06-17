import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { LogoMark } from '@/components/Logo'
import { redeemActivationCode, REDEEM_ERROR_TEXT } from '@/lib/org/redeem'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'

/**
 * /join/[code] — Eintrittspunkt für B2B-Unternehmenscodes.
 *
 * Zwei Pfade, je nach Login-Status:
 *
 *  • NICHT eingeloggt → /signup?code=… (Mitarbeiter registriert sich, Code
 *    wird beim Anlegen des Accounts eingelöst).
 *
 *  • EINGELOGGT → Code wird sofort server-side eingelöst:
 *      – Erfolg + Profil vorhanden  → /coach (mit Willkommens-Hinweis)
 *      – Erfolg + noch kein Profil  → /onboarding
 *      – Fehler                     → diese Seite zeigt eine klare Meldung
 *        mit dem Grund + Optionen.
 *
 * So funktioniert ein und derselbe Link für neue UND bestehende Nutzer —
 * der Chef muss nicht wissen, wer schon ein Konto hat.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode).trim().slice(0, 64)
  if (!code) redirect('/signup')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Nicht eingeloggt → Registrierung mit vorbefülltem Code
  if (!user) {
    redirect(`/signup?code=${encodeURIComponent(code)}`)
  }

  // Eingeloggt → Code direkt einlösen
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return <JoinError code={code} message="Der Dienst ist gerade nicht verfügbar. Bitte versuche es später noch einmal." />
  }
  const admin = createAdminClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await redeemActivationCode(admin, user.id, code)

  if (!result.ok) {
    return (
      <JoinError
        code={code}
        message={result.error ? REDEEM_ERROR_TEXT[result.error] : 'Der Code konnte nicht eingelöst werden.'}
      />
    )
  }

  // Erfolg → zum Coach (oder Onboarding, wenn noch kein Profil)
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_state')
    .eq('id', user.id)
    .maybeSingle()
  const hasProfile = profile?.onboarding_state === 'profiled' || profile?.onboarding_state === 'active'
  const orgParam = result.orgName ? `?welcome=${encodeURIComponent(result.orgName)}` : ''
  redirect(hasProfile ? `/coach${orgParam}` : `/onboarding${orgParam}`)
}

function JoinError({ code, message }: { code: string; message: string }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <LogoMark size={36} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Code konnte nicht eingelöst werden</h1>
        <div className="card text-left mb-6">
          <p className="text-sm text-[var(--color-ink-2)] mb-3">{message}</p>
          <p className="text-xs text-[var(--color-muted)]">
            Code: <span className="font-mono">{code}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/coach" className="btn btn-primary btn-block">Zum Coach</Link>
          <a href="mailto:kontakt@deepling.de?subject=Unternehmenscode" className="btn btn-ghost btn-block">
            Ansprechpartner kontaktieren
          </a>
        </div>
      </div>
    </main>
  )
}
