'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconSparkles, IconCheck } from '@/components/Icons'

export function RefineProfileButton({ hasMemories }: { hasMemories: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [stats, setStats] = useState<{ memories: number; conversations: number; messages: number } | null>(null)

  async function refine() {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/coach/refine', { method: 'POST' })
      const json = (await res.json().catch(() => null)) as {
        version?: number
        memoriesUsed?: number
        conversationsUsed?: number
        messagesUsed?: number
        error?: string
      } | null
      if (!res.ok || !json) {
        throw new Error(json?.error ?? 'Refresh fehlgeschlagen')
      }
      setVersion(json.version ?? null)
      setStats({
        memories: json.memoriesUsed ?? 0,
        conversations: json.conversationsUsed ?? 0,
        messages: json.messagesUsed ?? 0,
      })
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
        Tiefen-Analyse verfügbar, sobald der Coach erste Beobachtungen aus euren Gesprächen gespeichert hat.
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin" />
        <span>Tiefen-Analyse läuft — Opus liest deine Antworten, Memory und alle Chats (60–120 s) …</span>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="text-sm text-[var(--color-success)] flex items-start gap-2">
        <IconCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span>Profil-Version {version ? `v${version}` : 'aktualisiert'} aktiv.</span>
          {stats && (
            <span className="block text-xs text-[var(--color-ink-2)] mt-1">
              Verarbeitet: {stats.memories} Memories, {stats.conversations} Gespräche, {stats.messages} Nachrichten
            </span>
          )}
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-ink-2)]">
          <strong>Tiefen-Analyse:</strong> Opus 4.7 liest dein bestehendes Profil,
          deine 42 Onboarding-Antworten, alle gespeicherten Memory-Einträge und
          den vollständigen Chat-Verlauf — und baut daraus eine komplett neu
          durchdachte Profil-Version. Dauert ~60–120 Sekunden. Memory + Chat-Historie
          bleiben unverändert.
        </p>
        <div className="flex gap-2">
          <button onClick={refine} className="btn btn-primary text-sm px-3 py-1.5">
            Ja, Tiefen-Analyse starten
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
        className="btn btn-primary btn-block flex items-center justify-center gap-2"
        aria-label="Tiefen-Analyse starten — Profil aus allen Quellen neu aufbauen"
      >
        <IconSparkles className="w-4 h-4" />
        <span>Tiefen-Analyse: Profil aus allen Quellen schärfen</span>
      </button>
      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </>
  )
}
