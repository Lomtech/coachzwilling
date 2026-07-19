'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Vollanalyse per Freischalt-Code öffnen — Alternative zum 149-€-Kauf.
 * Der Coach gibt Klienten Einzel-Codes. Erfolg → full_unlocked → weiter in
 * den zweiten Fragebogen-Teil (/onboarding routet dann auf Teil 2).
 */
export function UnlockCodeForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const c = code.trim()
    if (!c || pending) return
    if (!isLoggedIn) {
      router.push('/login?next=/billing')
      return
    }
    setPending(true)
    setMsg(null)
    try {
      const res = await fetch('/api/unlock/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      })
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean; already?: boolean; error?: string
      } | null
      if (res.ok && json?.ok) {
        setMsg({ kind: 'ok', text: 'Code eingelöst — deine Vollanalyse ist freigeschaltet. Es geht gleich weiter …' })
        setCode('')
        // full_unlocked ist gesetzt → /onboarding schaltet Teil 2 frei.
        setTimeout(() => router.push('/onboarding'), 900)
      } else {
        const errText: Record<string, string> = {
          'code-not-found': 'Diesen Code kennen wir nicht. Bitte Schreibweise prüfen.',
          'code-inactive': 'Dieser Code wurde deaktiviert.',
          'code-used': 'Dieser Code wurde bereits eingelöst.',
          'code-required': 'Bitte gib einen Code ein.',
          'unauthorized': 'Bitte melde dich zuerst an.',
        }
        setMsg({ kind: 'err', text: errText[json?.error ?? ''] ?? 'Der Code konnte nicht eingelöst werden.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Netzwerkfehler — bitte später erneut versuchen.' })
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full text-center text-sm text-[var(--color-ink-2)] underline underline-offset-4 hover:text-[var(--color-ink)]"
      >
        Ich habe einen Freischalt-Code
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-[var(--color-line)] space-y-3">
      <p className="text-sm text-[var(--color-ink-2)]">
        Freischalt-Code von deinem Coach? Hier einlösen — dann brauchst du nicht zu bezahlen:
      </p>
      <input
        type="text"
        placeholder="z.B. DEEPLING-7B3K-2Q9X"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        className="font-mono"
        autoComplete="off"
        autoFocus
      />
      {msg && (
        <p className={'text-sm ' + (msg.kind === 'ok' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={pending || !code.trim()} className="btn btn-secondary btn-block">
        {pending ? 'Wird eingelöst …' : 'Code einlösen & Vollanalyse starten'}
      </button>
    </form>
  )
}
