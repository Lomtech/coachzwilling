'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-[var(--color-muted)]">Lädt …</div>}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/coach'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push(next)
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Login</h1>
      <p className="text-[var(--color-ink-2)] mb-6">Willkommen zurück.</p>

      {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email" required autoComplete="email"
          placeholder="E-Mail"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password" required autoComplete="current-password"
          placeholder="Passwort"
          value={password} onChange={e => setPassword(e.target.value)}
        />
        {error && (
          <div className="text-sm text-[var(--color-danger)]">{error}</div>
        )}
        <button type="submit" disabled={loading} className="btn btn-primary btn-block">
          {loading ? 'Wird geprüft …' : 'Einloggen'}
        </button>
      </form>
      <div className="mt-5 text-sm text-[var(--color-muted)] flex justify-between">
        <Link href="/signup" className="text-[var(--color-ink)] underline">Account anlegen</Link>
        <Link href="/forgot-password" className="text-[var(--color-ink)] underline">Passwort vergessen</Link>
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
