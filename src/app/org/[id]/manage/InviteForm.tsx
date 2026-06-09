'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function InviteForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'hr_admin'>('member')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/org/${orgId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      })
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean
        error?: string
        emailSent?: boolean
        emailError?: string | null
      }
      if (!res.ok) {
        setFeedback({ kind: 'err', msg: body.error ?? `HTTP ${res.status}` })
        return
      }
      const msg = body.emailSent
        ? `Einladung an ${email} versendet.`
        : `Einladung angelegt — Mail-Versand fehlgeschlagen (${body.emailError ?? 'unbekannt'}). Link ist trotzdem aktiv.`
      setFeedback({ kind: body.emailSent ? 'ok' : 'err', msg })
      setEmail('')
      startTransition(() => router.refresh())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          placeholder="email@firma.de"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="flex-1"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as 'member' | 'hr_admin')}
          className="sm:w-40"
        >
          <option value="member">Mitglied</option>
          <option value="hr_admin">HR-Admin</option>
        </select>
        <button
          type="submit"
          disabled={submitting || pending || !email.includes('@')}
          className="btn btn-primary"
        >
          Einladen
        </button>
      </div>
      {feedback && (
        <div className={
          'text-sm ' +
          (feedback.kind === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')
        }>
          {feedback.msg}
        </div>
      )}
      <p className="text-xs text-[var(--color-muted)] leading-snug">
        <strong>Mitglied</strong>: nutzt Coach, taucht im anonymen HR-Aggregat auf.{' '}
        <strong>HR-Admin</strong>: sieht das Dashboard, taucht selbst NICHT im Aggregat auf
        (verhindert Selbst-Identifikation in kleinen Teams).
      </p>
    </form>
  )
}
