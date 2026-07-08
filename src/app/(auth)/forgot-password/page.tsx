'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Passwort zurücksetzen</h1>
      {sent ? (
        <p className="text-[var(--color-ink-2)] mt-4">
          Wir haben dir einen Link an <strong>{email}</strong> geschickt.
        </p>
      ) : (
        <>
          <p className="text-[var(--color-ink-2)] mb-6">Wir senden dir einen Reset-Link.</p>
          <form onSubmit={onSubmit} className="space-y-3">
            <input
              type="email" required autoComplete="email"
              placeholder="E-Mail"
              value={email} onChange={e => setEmail(e.target.value)}
            />
            {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Wird gesendet …' : 'Link senden'}
            </button>
          </form>
        </>
      )}
      <div className="mt-5 text-sm text-[var(--color-muted)]">
        <Link href="/login" className="text-[var(--color-ink)] underline">Zurück zum Login</Link>
      </div>
    </div>
  )
}
