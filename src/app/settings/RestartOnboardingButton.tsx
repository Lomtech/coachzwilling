'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * "Fragebogen neu machen" — verwirft Drafts, schaltet Onboarding wieder
 * sichtbar und navigiert zur Onboarding-Seite. Das *aktive* Coach-Profil
 * bleibt vorhanden, bis das neue erstellt ist (kein Chat-Ausfall).
 */
export function RestartOnboardingButton() {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function restart() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/onboarding/reset', { method: 'POST' })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Reset fehlgeschlagen')
      }
      router.push('/onboarding')
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
        <span>Setze Fragebogen zurück …</span>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-ink-2)]">
          Du startest den 42-Fragen-Scan komplett neu — mit den intelligenten
          Vertiefungsfragen für kurze Antworten. Dein aktuelles Coach-Profil
          und deine Chat-Historie bleiben unverändert, bis du den neuen Scan
          abgeschlossen hast. Beim Abschluss wird das neue Profil aktiv geschaltet
          und das alte archiviert.
        </p>
        <div className="flex gap-2">
          <button onClick={restart} className="btn btn-primary text-sm px-3 py-1.5">
            Ja, Fragebogen neu starten
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
        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] underline underline-offset-2"
      >
        Fragebogen neu machen
      </button>
      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </>
  )
}
