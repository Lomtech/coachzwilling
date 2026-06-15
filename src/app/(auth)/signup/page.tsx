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
  // B2B-Activation-Code: kommt entweder aus URL (?code=...) oder /join/[code]
  // redirect, oder User trägt ihn manuell ein. Default leer.
  const codeFromUrl = (search.get('code') ?? '').trim().toUpperCase()
  const [fullName, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [activationCode, setActivationCode] = useState(codeFromUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeWarning, setCodeWarning] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCodeWarning(null)
    setLoading(true)
    try {
      // Server-side Signup mit Auto-Confirm (umgeht Email-Bestätigungs-Dance).
      // Backend nutzt admin.createUser mit email_confirm: true → kein
      // "email not confirmed"-Fehler beim direkt darauffolgenden Login.
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName,
          activationCode: activationCode.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        org?: { ok: boolean; orgId?: string; error?: string }
      } | null
      if (!res.ok || !json?.ok) {
        const errCode = json?.error ?? `HTTP ${res.status}`
        if (errCode === 'email-already-exists') {
          setError('Diese E-Mail ist bereits registriert. Geh zum Login.')
        } else {
          setError(errCode)
        }
        return
      }
      // Org-Code-Redeem-Status: User ist angelegt, aber Code evtl. ungültig.
      // Wir loggen ihn trotzdem ein — er kann den Code später manuell nachreichen.
      if (activationCode && json.org && !json.org.ok) {
        const reason = ({
          'code-not-found': 'Code wurde nicht gefunden.',
          'code-inactive':  'Code ist deaktiviert.',
          'code-expired':   'Code ist abgelaufen.',
          'code-full':      'Code ist bereits ausgeschöpft (alle Plätze vergeben).',
        } as Record<string, string>)[json.org.error ?? ''] ?? 'Code konnte nicht eingelöst werden.'
        setCodeWarning(reason + ' Dein Account ist trotzdem aktiv — bitte melde dich bei deinem Ansprechpartner.')
      }
      // Direkt einloggen (User ist bereits confirmed)
      const supabase = createClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) { setError(signInErr.message); return }
      router.push(next)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Signup fehlgeschlagen')
    } finally {
      setLoading(false)
    }
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
        {/* B2B-Code: nur sichtbar wenn Code aus URL kam ODER User klickt
            "Geschäftlicher Zugang? Code eingeben". */}
        {(codeFromUrl || activationCode) ? (
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-muted)] uppercase tracking-wider">
              Unternehmenscode
            </label>
            <input
              type="text"
              placeholder="DEEPLING-XXX-XXXX"
              value={activationCode}
              onChange={e => setActivationCode(e.target.value.toUpperCase())}
              className="font-mono"
              autoComplete="off"
            />
          </div>
        ) : (
          <details className="text-sm text-[var(--color-muted)]">
            <summary className="cursor-pointer hover:text-[var(--color-ink)]">
              Geschäftlicher Zugang? Code eingeben
            </summary>
            <input
              type="text"
              placeholder="DEEPLING-XXX-XXXX"
              value={activationCode}
              onChange={e => setActivationCode(e.target.value.toUpperCase())}
              className="font-mono mt-2"
              autoComplete="off"
            />
          </details>
        )}
        {error && (
          <div className="text-sm text-[var(--color-danger)]">{error}</div>
        )}
        {codeWarning && (
          <div className="text-sm text-[var(--color-warning)]">{codeWarning}</div>
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
