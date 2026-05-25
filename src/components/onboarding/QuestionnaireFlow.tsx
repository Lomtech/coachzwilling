'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS, TOTAL_QUESTIONS, type Question } from '@/data/questionnaire'

interface Props {
  initialAnswers: Record<string, string>
  initialIndex: number
}

const PROBE_MIN_CHARS = 40 // synchron mit lib/coach/probe.ts
const MAX_PROBES_PER_SCAN = 5

export function QuestionnaireFlow({ initialAnswers, initialIndex }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [index, setIndex] = useState(initialIndex)
  const [pending, startTransition] = useTransition()
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Probe-State pro Frage: question, supplement, loading
  const [probeQuestion, setProbeQuestion] = useState<string | null>(null)
  const [probeAnswer, setProbeAnswer] = useState('')
  const [probeLoading, setProbeLoading] = useState(false)
  const [probesUsed, setProbesUsed] = useState(0)
  const [probeAttempted, setProbeAttempted] = useState<Set<number>>(new Set())

  // Opt-in für Follow-up-Mails — wird auf dem letzten Frage-Screen unter dem
  // "Profil erstellen"-Button als kleine Karte gezeigt. Default false (DSGVO).
  const [followupOptIn, setFollowupOptIn] = useState(false)

  const q: Question = QUESTIONS[index]
  const rawAnswer = answers[String(q.id)] ?? ''
  // Wenn die Antwort schon einen Probe-Supplement enthält (Format: "X | Y"), nimm nur den ersten Teil als raw
  const rawOnly = rawAnswer.split(/\s*\|\s*/)[0]
  const answered = Boolean(rawAnswer)
  const progress = Math.round(((index) / TOTAL_QUESTIONS) * 100)
  const isLast = index === TOTAL_QUESTIONS - 1

  // Auto-save bei jedem Update
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

  // Reset Probe-State bei Frage-Wechsel
  useEffect(() => {
    setProbeQuestion(null)
    setProbeAnswer('')
    setProbeLoading(false)
  }, [index])

  function setAnswer(value: string) {
    setAnswers(prev => ({ ...prev, [String(q.id)]: value }))
  }

  function appendProbeAnswer() {
    const supplement = probeAnswer.trim()
    if (!supplement) return
    const combined = `${rawOnly.trim()} | ${supplement}`
    setAnswer(combined)
    setProbeQuestion(null)
    setProbeAnswer('')
    proceedToNext()
  }

  function proceedToNext() {
    if (isLast) return
    startTransition(() => setIndex(i => Math.min(TOTAL_QUESTIONS - 1, i + 1)))
  }

  async function tryProbe() {
    // Probe-Voraussetzungen
    if (q.type !== 'open') { proceedToNext(); return }
    if (rawOnly.trim().length >= PROBE_MIN_CHARS) { proceedToNext(); return }
    if (probesUsed >= MAX_PROBES_PER_SCAN) { proceedToNext(); return }
    if (probeAttempted.has(q.id)) { proceedToNext(); return } // pro Frage max 1 Probe

    setProbeLoading(true)
    setProbeAttempted(prev => new Set(prev).add(q.id))
    try {
      const res = await fetch('/api/onboarding/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, answer: rawOnly }),
      })
      const json = (await res.json().catch(() => null)) as { probe?: string | null } | null
      if (json?.probe) {
        setProbeQuestion(json.probe)
        setProbesUsed(p => p + 1)
      } else {
        proceedToNext() // kein Probe verfügbar → einfach weiter
      }
    } catch {
      proceedToNext() // Fehler → einfach weiter
    } finally {
      setProbeLoading(false)
    }
  }

  function next() {
    if (!answered) return
    // Wenn Probe gerade aktiv: ergänzen oder skip
    if (probeQuestion) {
      if (probeAnswer.trim()) {
        appendProbeAnswer()
      } else {
        // skip
        setProbeQuestion(null)
        proceedToNext()
      }
      return
    }
    // Sonst: ggf. Probe anfragen
    void tryProbe()
  }

  function prev() {
    if (probeQuestion) {
      setProbeQuestion(null)
      setProbeAnswer('')
      return
    }
    startTransition(() => setIndex(i => Math.max(0, i - 1)))
  }

  async function finalize() {
    setFinalizing(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, followupOptIn }),
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
            <>
              <textarea
                autoFocus={!probeQuestion}
                value={rawOnly}
                onChange={e => setAnswer(e.target.value)}
                placeholder="In eigenen Worten …"
                rows={5}
                disabled={!!probeQuestion}
                className={probeQuestion ? 'opacity-60' : ''}
              />
              {/* Probe-Block: erscheint nach Klick auf "Weiter" wenn Antwort zu kurz */}
              {probeQuestion && (
                <div className="mt-4 card border-l-4 border-l-[var(--color-accent)] bg-[var(--color-accent-soft)]/30 anim-fade-up">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-[var(--color-accent)] text-lg leading-none">↳</span>
                    <p className="text-sm font-medium text-[var(--color-ink)]">
                      {probeQuestion}
                    </p>
                  </div>
                  <textarea
                    autoFocus
                    value={probeAnswer}
                    onChange={e => setProbeAnswer(e.target.value)}
                    placeholder="Konkreter beschreiben (optional) …"
                    rows={3}
                  />
                  <div className="mt-2 text-xs text-[var(--color-muted)]">
                    Klick „Weiter" um zu ergänzen oder leer lassen + „Weiter" um zu überspringen.
                  </div>
                </div>
              )}
              {probeLoading && (
                <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                  <div className="w-3 h-3 rounded-full border-2 border-[var(--color-surface-2)] border-t-[var(--color-accent)] animate-spin" />
                  <span>Generiere Vertiefungsfrage …</span>
                </div>
              )}
            </>
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

        {/* Probe-Counter, klein und dezent */}
        {probesUsed > 0 && (
          <div className="mt-4 text-xs text-[var(--color-muted)] text-right">
            Vertiefungsfragen genutzt: {probesUsed} / {MAX_PROBES_PER_SCAN}
          </div>
        )}

        {/* Follow-up-Opt-in nur auf der letzten Frage anzeigen — dezent, kein Modal */}
        {isLast && !probeQuestion && (
          <label
            className="mt-8 flex items-start gap-3 p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 cursor-pointer hover:bg-[var(--color-surface-2)] transition"
          >
            <input
              type="checkbox"
              checked={followupOptIn}
              onChange={(e) => setFollowupOptIn(e.target.checked)}
              className="mt-1 w-4 h-4 shrink-0"
            />
            <span className="text-sm text-[var(--color-ink-2)]">
              <span className="font-medium text-[var(--color-ink)]">Follow-up-Mails vom Coach aktivieren.</span>{' '}
              In regelmäßigen Abständen knüpft dein Coach per Email an offene Punkte aus euren Gesprächen an.
              Frequenz + Pause jederzeit in den Einstellungen änderbar, ein-Klick-Abbestellen über jede Mail.
            </span>
          </label>
        )}
      </div>

      {/* Sticky footer mit Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg)]/90 backdrop-blur border-t border-[var(--color-border)] safe-bottom">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={(index === 0 && !probeQuestion) || pending || probeLoading}
            className="btn btn-ghost"
          >
            {probeQuestion ? 'Zurück' : 'Zurück'}
          </button>

          {isLast && !probeQuestion ? (
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
              disabled={!answered || pending || probeLoading}
              className="btn btn-primary flex-1"
            >
              {probeQuestion
                ? (probeAnswer.trim() ? 'Ergänzen & weiter →' : 'Überspringen →')
                : 'Weiter'}
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
