'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS, TOTAL_QUESTIONS, type Question } from '@/data/questionnaire'

interface Props {
  initialAnswers: Record<string, string>
  initialIndex: number
}

export function QuestionnaireFlow({ initialAnswers, initialIndex }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [index, setIndex] = useState(initialIndex)
  const [pending, startTransition] = useTransition()
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q: Question = QUESTIONS[index]
  const answered = Boolean(answers[String(q.id)])
  const progress = Math.round(((index) / TOTAL_QUESTIONS) * 100)
  const isLast = index === TOTAL_QUESTIONS - 1

  // Auto-save bei jedem Update (debounced via transition)
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    const t = setTimeout(() => {
      void fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
    }, 400)
    return () => clearTimeout(t)
  }, [answers])

  function setAnswer(value: string) {
    setAnswers(prev => ({ ...prev, [String(q.id)]: value }))
  }

  function next() {
    if (!answered) return
    startTransition(() => setIndex(i => Math.min(TOTAL_QUESTIONS - 1, i + 1)))
  }

  function prev() {
    startTransition(() => setIndex(i => Math.max(0, i - 1)))
  }

  async function finalize() {
    setFinalizing(true)
    setError(null)
    try {
      // Antworten mit dem Finalize-Request mitschicken — robust gegen
      // verlorene Auto-Saves (Race, kurze Sessions, Network-Glitches).
      const res = await fetch('/api/onboarding/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Profil-Generation fehlgeschlagen')
      }
      router.push('/coach')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      setFinalizing(false)
    }
  }

  if (finalizing) {
    return <FinalizingView />
  }

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Progress bar */}
      <div className="px-5 pt-5 pb-3 max-w-xl w-full mx-auto">
        <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
          <span>{q.section}</span>
          <span>{index + 1} / {TOTAL_QUESTIONS}</span>
        </div>
        <div className="h-1.5 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-ink)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 px-5 pt-6 pb-32 max-w-xl w-full mx-auto">
        <h1 className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight">
          {q.prompt}
        </h1>
        {q.helper && (
          <p className="mt-3 text-sm text-[var(--color-ink-2)]">{q.helper}</p>
        )}

        <div className="mt-7 space-y-2.5">
          {q.type === 'open' ? (
            <textarea
              autoFocus
              value={answers[String(q.id)] ?? ''}
              onChange={e => setAnswer(e.target.value)}
              placeholder="In eigenen Worten …"
              rows={5}
            />
          ) : (
            q.options!.map(opt => {
              const selected = answers[String(q.id)] === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnswer(opt.value)}
                  className={
                    'w-full text-left px-4 py-3.5 rounded-2xl border transition ' +
                    (selected
                      ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]')
                  }
                >
                  {opt.label}
                </button>
              )
            })
          )}
        </div>

        {error && (
          <div className="mt-4 text-sm text-[var(--color-danger)]">{error}</div>
        )}
      </div>

      {/* Sticky footer mit Buttons (mobile-first) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg)]/90 backdrop-blur border-t border-[var(--color-border)] safe-bottom">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={index === 0 || pending}
            className="btn btn-ghost"
          >
            Zurück
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={finalize}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              Profil erstellen →
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              Weiter
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FinalizingView() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin mb-6" />
      <h2 className="text-xl font-semibold tracking-tight mb-2">Dein Profil wird erstellt</h2>
      <p className="text-[var(--color-ink-2)] max-w-sm">
        Dein Coach-Profil wird aus deinen Antworten erstellt.
        Das dauert etwa 30–60 Sekunden.
      </p>
    </div>
  )
}
