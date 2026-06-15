'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { MINI_SCAN_QUESTIONS, MINI_SCAN_TOTAL, type MiniScanQuestion } from '@/data/mini-scan'

type Step = 'intro' | 'questions' | 'generating' | 'result'

export function MiniScanFlow() {
  const [step, setStep] = useState<Step>('intro')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [shortProfile, setShortProfile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q: MiniScanQuestion = MINI_SCAN_QUESTIONS[index]
  const answer = q ? (answers[q.id] ?? '') : ''
  const progress = step === 'questions' ? Math.round((index / MINI_SCAN_TOTAL) * 100) : 0
  const isLast = index === MINI_SCAN_TOTAL - 1
  const canProceed = useMemo(() => {
    if (!q) return false
    if (!answer) return false
    if (q.type === 'open' && q.minChars && answer.trim().length < q.minChars) return false
    return true
  }, [q, answer])

  function setAnswer(value: string) {
    setAnswers(prev => ({ ...prev, [q.id]: value }))
  }

  async function generate(includeEmail: boolean) {
    setStep('generating')
    setError(null)
    try {
      const res = await fetch('/api/mini-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          email: includeEmail ? email.trim() : null,
          name: includeEmail ? name.trim() || null : null,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; shortProfile?: string | null; error?: string }
        | null
      if (!res.ok || !json) {
        throw new Error(json?.error ?? 'Profil konnte nicht erstellt werden')
      }
      setShortProfile(json.shortProfile ?? null)
      setStep('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      setStep('questions')
    }
  }

  // ─── INTRO ───────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <main className="min-h-dvh flex flex-col px-5 max-w-xl w-full mx-auto">
        <header className="py-4">
          <Link href="/" className="font-semibold text-lg tracking-tight">
            Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling
          </Link>
        </header>
        <div className="flex-1 py-8">
          <div className="chip mb-4">Mini-Scan · kostenlos</div>
          <h1 className="text-3xl font-semibold tracking-tight mb-4">
            In 5 Fragen zu deinem Kurzprofil.
          </h1>
          <p className="text-[var(--color-ink-2)] mb-6">
            Du beantwortest 5 ausgewählte Fragen — wir generieren in 90 Sekunden
            ein erstaunlich präzises Kurzprofil. Kein Account nötig, keine E-Mail
            zwingend.
          </p>
          <ul className="space-y-2 text-sm text-[var(--color-ink-2)] mb-8">
            <li>• Dauer: ~2 Minuten</li>
            <li>• Ergebnis sofort auf dem Bildschirm</li>
            <li>• Optional per E-Mail zugeschickt</li>
            <li>• Du entscheidest danach, ob du den vollen 42-Fragen-Scan willst</li>
          </ul>
          <button
            onClick={() => setStep('questions')}
            className="btn btn-primary btn-block"
          >
            Los geht's
          </button>
          <p className="text-xs text-[var(--color-muted)] mt-4 text-center">
            Bereits einen Account? <Link href="/login" className="underline">Anmelden</Link>
          </p>
        </div>
      </main>
    )
  }

  // ─── QUESTIONS ───────────────────────────────────────────────────────
  if (step === 'questions') {
    return (
      <main className="flex flex-col min-h-dvh">
        {/* Progress */}
        <div className="px-5 pt-5 pb-3 max-w-xl w-full mx-auto">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
            <span>Mini-Scan</span>
            <span>{index + 1} / {MINI_SCAN_TOTAL}</span>
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
                  autoFocus
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder="In eigenen Worten …"
                  rows={5}
                />
                {q.minChars && (
                  <div className="text-xs text-[var(--color-muted)] text-right">
                    {answer.trim().length} / {q.minChars} Zeichen
                  </div>
                )}
              </>
            ) : (
              q.options!.map(opt => {
                const selected = answer === opt.value
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

          {error && <div className="mt-4 text-sm text-[var(--color-danger)]">{error}</div>}
        </div>

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg)]/90 backdrop-blur border-t border-[var(--color-border)] safe-bottom">
          <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={index === 0}
              className="btn btn-ghost"
            >
              Zurück
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={() => generate(false)}
                disabled={!canProceed}
                className="btn btn-primary flex-1"
              >
                Profil erstellen →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex(i => Math.min(MINI_SCAN_TOTAL - 1, i + 1))}
                disabled={!canProceed}
                className="btn btn-primary flex-1"
              >
                Weiter
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ─── GENERATING ──────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin mb-6" />
        <h2 className="text-xl font-semibold tracking-tight mb-2">Dein Kurzprofil wird erstellt</h2>
        <p className="text-[var(--color-ink-2)] max-w-sm">
          Das dauert ungefähr 5–15 Sekunden.
        </p>
      </main>
    )
  }

  // ─── RESULT ──────────────────────────────────────────────────────────
  return (
    <main className="min-h-dvh px-5 py-6 max-w-2xl w-full mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling
        </Link>
        <span className="text-sm text-[var(--color-muted)]">Mini-Scan</span>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight mb-2">Dein Kurzprofil</h1>
      <p className="text-sm text-[var(--color-ink-2)] mb-6">
        Erstellt aus deinen 5 Antworten. Der vollständige 42-Fragen-Scan geht ~10x tiefer.
      </p>

      <div className="card mb-6 whitespace-pre-wrap leading-relaxed">
        {shortProfile ?? '(Profil konnte nicht generiert werden — bitte später erneut versuchen.)'}
      </div>

      {/* E-Mail-Capture + Upsell */}
      <div className="card bg-[var(--color-accent-soft)]/30 border-[var(--color-accent)]/30 mb-4">
        <h2 className="font-semibold mb-2">Vollständiges Profil — alle Sektionen</h2>
        <p className="text-sm text-[var(--color-ink-2)] mb-4">
          Der vollständige Scan (50 Fragen, 18-25 Min.) erzeugt ein detailliertes
          Rohprofil + Wissensdatei (A1–A9 plus B1–B15) und schaltet den persönlichen
          Deepling frei.
        </p>
        <div className="space-y-2 mb-3">
          <input
            type="text"
            placeholder="Vorname (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            type="email"
            placeholder="deine@email.de"
            value={email}
            onChange={e => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
          />
        </div>
        <button
          type="button"
          onClick={() => generate(true)}
          disabled={!email.trim()}
          className="btn btn-primary btn-block"
        >
          Profil per E-Mail + Vollscan starten
        </button>
        <p className="text-xs text-[var(--color-muted)] mt-3 text-center">
          Mit dem Eintragen stimmst du der Speicherung gemäß
          <Link href="/datenschutz" className="underline mx-1">Datenschutz</Link>
          zu. Keine Newsletter ohne explizite Zustimmung.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Link href="/signup" className="btn btn-secondary flex-1 text-center">
          Direkt zum Account →
        </Link>
        <button
          type="button"
          onClick={() => {
            setStep('intro')
            setIndex(0)
            setAnswers({})
            setShortProfile(null)
          }}
          className="btn btn-ghost flex-1"
        >
          Nochmal machen
        </button>
      </div>
    </main>
  )
}
