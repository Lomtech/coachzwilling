'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Passwort setzen/ändern für einen EINGELOGGTEN User (Session muss existieren).
 * Genutzt an zwei Stellen:
 *   1. /reset-password — Ziel des Passwort-Reset-Links (Recovery-Session)
 *   2. Einstellungen → Sicherheit — jederzeit Passwort ändern
 *
 * Nutzt supabase.auth.updateUser({ password }). Wenn keine Session da ist
 * (Link abgelaufen / direkt aufgerufen), liefert Supabase einen klaren Fehler,
 * den wir anzeigen + auf „neuen Link anfordern" verweisen.
 */
export function SetPasswordForm({
  redirectAfter,
  submitLabel = 'Passwort speichern',
}: {
  redirectAfter?: string
  submitLabel?: string
}) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (pw.length < 8) {
      setMsg({ kind: 'err', text: 'Das Passwort braucht mindestens 8 Zeichen.' })
      return
    }
    if (pw !== pw2) {
      setMsg({ kind: 'err', text: 'Die beiden Passwörter stimmen nicht überein.' })
      return
    }
    setPending(true)
    setMsg(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pw })
    setPending(false)
    if (error) {
      const missing = /session|missing|not.*authenticated|logged/i.test(error.message)
      setMsg({
        kind: 'err',
        text: missing
          ? 'Deine Sitzung ist abgelaufen. Fordere über „Passwort vergessen" einen neuen Link an.'
          : error.message,
      })
      return
    }
    setPw('')
    setPw2('')
    setMsg({ kind: 'ok', text: 'Passwort gespeichert. Du kannst dich damit ab sofort anmelden.' })
    if (redirectAfter) {
      router.push(redirectAfter)
      router.refresh()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="Neues Passwort (min. 8 Zeichen)"
        value={pw}
        onChange={e => setPw(e.target.value)}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="Passwort wiederholen"
        value={pw2}
        onChange={e => setPw2(e.target.value)}
      />
      {msg && (
        <p className={'text-sm ' + (msg.kind === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending || !pw || !pw2} className="btn btn-primary btn-block">
        {pending ? 'Wird gespeichert …' : submitLabel}
      </button>
    </form>
  )
}
