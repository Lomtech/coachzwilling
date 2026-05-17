'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefineProfileButton({ hasMemories }: { hasMemories: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<number | null>(null)

  async function refine() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/coach/refine', { method: 'POST' })
      const json = (await res.json().catch(() => null)) as {
        version?: number; memoriesUsed?: number; error?: string
      } | null
      if (!res.ok || !json) {
        throw new Error(json?.error ?? 'Refresh fehlgeschlagen')
      }
      setVersion(json.version ?? null)
      setStep('done')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setStep('idle')
    }
  }

  if (!hasMemories) {
    return (
      <div className="text-xs text-[var(--color-muted)]">
        Auffrischen verfügbar, sobald der Coach erste Beobachtungen aus euren Gesprächen gespeichert hat.
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin" />
        <span>Profil wird mit Chat-Erkenntnissen aktualisiert (30–60 s) …</span>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="text-sm text-[var(--color-success)]">
        ✓ Profil-Version {version ? `v${version}` : 'aktualisiert'} aktiv.
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-ink-2)]">
          Der Coach liest dein bestehendes Profil + alle gespeicherten Memory-Einträge und
          schreibt eine neue, geschärfte Profil-Version. Dauert ~30–60 s. Memory bleibt erhalten.
        </p>
        <div className="flex gap-2">
          <button onClick={refine} className="btn btn-primary text-sm px-3 py-1.5">
            Ja, mit Chat-Erkenntnissen auffrischen
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
        className="text-sm font-medium text-[var(--color-accent)] hover:underline underline-offset-2"
      >
        ↻ Profil mit Chat-Erkenntnissen auffrischen
      </button>
      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </>
  )
}
