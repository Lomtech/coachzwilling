import Link from 'next/link'
import { notFound } from 'next/navigation'
import { serviceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Coach-Profil — Coaching-Zwilling',
  description: 'Geteiltes Coach-Profil zur gemeinsamen Besprechung.',
  robots: { index: false, follow: false }, // nie indexieren
}

export default async function SharedProfilePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token || token.length < 8 || token.length > 64) notFound()

  const supa = serviceClient()
  const { data: cp } = await supa
    .from('coach_profiles')
    .select('id, user_id, config_md, generated_at, version, share_enabled')
    .eq('share_token', token)
    .maybeSingle()

  if (!cp || !cp.share_enabled) notFound()

  // Namen des Eigentümers für freundliche Headline (ohne Email)
  const { data: ownerProfile } = await supa
    .from('profiles')
    .select('full_name')
    .eq('id', cp.user_id)
    .maybeSingle()

  const ownerName = ownerProfile?.full_name ?? 'Klient:in'
  const generated = new Date(cp.generated_at).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <main className="min-h-dvh">
      {/* Top bar — neutral, kein "Zurück" weil Public-Link */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">
            Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling
          </Link>
          <span className="text-xs text-[var(--color-muted)] hidden sm:inline">
            Geteiltes Profil · Read-only
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-8">
        <div className="mb-6">
          <div className="chip mb-3">Coach-Profil</div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Profil von {ownerName}
          </h1>
          <p className="text-sm text-[var(--color-ink-2)] mt-2">
            Version {cp.version} · erstellt am {generated} · zur gemeinsamen Besprechung geteilt
          </p>
        </div>

        <article className="card prose-coach whitespace-pre-wrap leading-relaxed">
          {cp.config_md}
        </article>

        <div className="mt-8 card bg-[var(--color-accent-soft)]/30 border-[var(--color-accent)]/30">
          <h2 className="font-semibold mb-2">Was ist der Coaching-Zwilling?</h2>
          <p className="text-sm text-[var(--color-ink-2)] mb-4">
            Ein personalisierter KI-Coach, der aus 50 Fragen ein präzises Profil
            ableitet — und in jeder Antwort exakt im Stil dieser Person agiert.
            Dieses Profil hier ist der "Beipackzettel" — der eigentliche Coach
            wird damit kalibriert.
          </p>
          <Link href="/" className="btn btn-primary">
            Mehr erfahren →
          </Link>
        </div>

        <p className="text-xs text-[var(--color-muted)] mt-6 text-center">
          Dieser Link wurde von {ownerName} geteilt und kann jederzeit deaktiviert werden.
        </p>
      </div>
    </main>
  )
}
