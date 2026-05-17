'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="text-[var(--color-muted)]">Lädt …</div>}>
      <SignupInner />
    </Suspense>
  )
}

function SignupInner() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/onboarding'
  const [fullName, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push(next)
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Profil anlegen</h1>
      <p className="text-[var(--color-ink-2)] mb-6">
        Wir nutzen deine E-Mail nur für Login + Rechnung.
      </p>

      {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text" required autoComplete="name"
          placeholder="Vor- und Nachname"
          value={fullName} onChange={e => setName(e.target.value)}
        />
        <input
          type="email" required autoComplete="email"
          placeholder="E-Mail"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password" required minLength={8} autoComplete="new-password"
          placeholder="Passwort (min. 8 Zeichen)"
          value={password} onChange={e => setPassword(e.target.value)}
        />
        {error && (
          <div className="text-sm text-[var(--color-danger)]">{error}</div>
        )}
        <button type="submit" disabled={loading} className="btn btn-primary btn-block">
          {loading ? 'Wird erstellt …' : 'Account erstellen'}
        </button>
      </form>
      <div className="mt-5 text-sm text-[var(--color-muted)]">
        Schon einen Account? <Link href="/login" className="text-[var(--color-ink)] underline">Login</Link>
      </div>
    </div>
  )
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-muted)]">
      <div className="flex-1 h-px bg-[var(--color-border)]" />
      <span>oder mit E-Mail</span>
      <div className="flex-1 h-px bg-[var(--color-border)]" />
    </div>
  )
}
