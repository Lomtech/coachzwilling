'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconRefresh } from '@/components/Icons'

export function RegenerateProfileButton() {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function regenerate() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/coach/regenerate', { method: 'POST' })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Fehler bei der Profil-Generierung')
      }
      setStep('done')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setStep('idle')
    }
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin" />
        <span>Profil wird neu erstellt (30–60 s) …</span>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="text-sm text-[var(--color-success)]">
        ✓ Neues Coach-Profil ist aktiv.
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-ink-2)]">
          Dein aktuelles Profil wird deaktiviert (Historie bleibt). Aus deinen 50 Antworten
          wird ein neues Profil mit der aktuellen Prompt-Version generiert. Dauert ~30–60 Sekunden.
        </p>
        <div className="flex gap-2">
          <button onClick={regenerate} className="btn btn-primary text-sm px-3 py-1.5">
            Ja, neu generieren
          </button>
          <button onClick={() => setStep('idle')} className="btn btn-ghost text-sm px-3 py-1.5">
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setStep('confirm')}
        className="btn btn-ghost btn-block flex items-center justify-center gap-2 text-sm"
        aria-label="Profil aus 42 Onboarding-Antworten komplett neu generieren"
      >
        <IconRefresh className="w-4 h-4" />
        <span>Profil neu aus Antworten generieren</span>
      </button>
      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </>
  )
}
