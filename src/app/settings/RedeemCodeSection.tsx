'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Unternehmenscode nachträglich einlösen — für bereits registrierte User,
 * die später einen B2B-Code von ihrem Arbeitgeber bekommen. Postet an
 * /api/org/redeem (Session-authentifiziert), zeigt klares Feedback.
 */
export function RedeemCodeSection({ isOrgMember }: { isOrgMember: boolean }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const c = code.trim()
    if (!c || pending) return
    setPending(true)
    setMsg(null)
    try {
      const res = await fetch('/api/org/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      })
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean; orgName?: string; alreadyMember?: boolean; error?: string
      } | null
      if (res.ok && json?.ok) {
        const org = json.orgName ? ` (${json.orgName})` : ''
        setMsg({
          kind: 'ok',
          text: json.alreadyMember
            ? `Du bist bereits freigeschaltet${org}.`
            : `Code eingelöst — du bist jetzt freigeschaltet${org}.`,
        })
        setCode('')
        router.refresh()
      } else {
        const errText: Record<string, string> = {
          'code-not-found': 'Diesen Code kennen wir nicht. Bitte Schreibweise prüfen.',
          'code-inactive': 'Dieser Code wurde deaktiviert.',
          'code-expired': 'Dieser Code ist abgelaufen.',
          'code-full': 'Alle Plätze für diesen Code sind bereits vergeben.',
          'code-required': 'Bitte gib einen Code ein.',
        }
        setMsg({ kind: 'err', text: errText[json?.error ?? ''] ?? 'Der Code konnte nicht eingelöst werden.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Netzwerkfehler — bitte später erneut versuchen.' })
    } finally {
      setPending(false)
    }
  }

  if (isOrgMember) {
    return (
      <p className="text-sm text-[var(--color-ink-2)]">
        Dein Zugang läuft über dein Unternehmen. ✓
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-[var(--color-ink-2)]">
        Du hast einen Unternehmenscode von deinem Arbeitgeber? Hier einlösen:
      </p>
      <input
        type="text"
        placeholder="z.B. DEEPLING-ACME-7B3K"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        className="font-mono"
        autoComplete="off"
      />
      {msg && (
        <p className={'text-sm ' + (msg.kind === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending || !code.trim()} className="btn btn-secondary btn-block">
        {pending ? 'Wird eingelöst …' : 'Code einlösen'}
      </button>
    </form>
  )
}
