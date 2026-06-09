'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS, TOTAL_QUESTIONS, FOLLOWUP_QUESTION_IDS, type Question } from '@/data/questionnaire'

interface Props {
  initialAnswers: Record<string, string>
  initialIndex: number
}

const TOTAL_FOLLOWUPS = FOLLOWUP_QUESTION_IDS.length // V3-Doc: genau 5 feste Nachfragen

export function QuestionnaireFlow({ initialAnswers, initialIndex }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [index, setIndex] = useState(initialIndex)
  const [pending, startTransition] = useTransition()
  const [finalizing, setFinalizing] = useState(false)
  const [profilerChars, setProfilerChars] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Nachfrage-State pro Frage (V3-Doc: 5 feste Nachfragen an Q4, Q21, Q30, Q33, Q40)
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUpAnswer, setFollowUpAnswer] = useState('')

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

  // Reset Nachfrage-State bei Frage-Wechsel — falls die nächste Frage selbst
  // schon eine bestehende Nachfrage-Antwort hat (Resume-Fall), pre-populate.
  useEffect(() => {
    const raw = answers[String(q.id)] ?? ''
    const [, existingFollow] = raw.split(/\s*\|\s*/)
    setShowFollowUp(false)
    setFollowUpAnswer(existingFollow ?? '')
  }, [index, q.id, answers])

  function setAnswer(value: string) {
    setAnswers(prev => ({ ...prev, [String(q.id)]: value }))
  }

  function commitFollowUpAndProceed() {
    const supplement = followUpAnswer.trim()
    const combined = supplement
      ? `${rawOnly.trim()} | ${supplement}`
      : rawOnly.trim()
    setAnswer(combined)
    setShowFollowUp(false)
    setFollowUpAnswer('')
    proceedToNext()
  }

  function proceedToNext() {
    if (isLast) return
    startTransition(() => setIndex(i => Math.min(TOTAL_QUESTIONS - 1, i + 1)))
  }

  function next() {
    if (!answered) return
    // Wenn Nachfrage gerade aktiv: ergänzen oder überspringen
    if (showFollowUp) {
      commitFollowUpAndProceed()
      return
    }
    // V3-Doc: feste Nachfrage nur an den im Fragebogen markierten Stellen
    if (q.followUp) {
      setShowFollowUp(true)
      return
    }
    proceedToNext()
  }

  function prev() {
    if (showFollowUp) {
      setShowFollowUp(false)
      setFollowUpAnswer('')
      return
    }
    startTransition(() => setIndex(i => Math.max(0, i - 1)))
  }

  async function finalize() {
    setFinalizing(true)
    setProfilerChars(0)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ answers, followupOptIn }),
      })
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }

      // SSE-Reader. Bei Erfolg endet der Stream mit `event: done`.
      // Wenn der Stream wegen Netz / Tab-Suspend abreisst, fällt der
      // catch-Block unten auf Polling /api/onboarding/status zurück.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let sawDone = false
      let sawError: string | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, nl)
          buf = buf.slice(nl + 2)
          const lines = block.split('\n')
          let event = 'message'
          let data = ''
          for (const ln of lines) {
            if (ln.startsWith('event: ')) event = ln.slice(7).trim()
            else if (ln.startsWith('data: ')) data += ln.slice(6)
          }
          if (!data) continue
          let payload: unknown = null
          try { payload = JSON.parse(data) } catch { /* ignore */ }
          if (event === 'progress' && payload && typeof payload === 'object' && 'chars' in payload) {
            const c = (payload as { chars?: number }).chars
            if (typeof c === 'number') setProfilerChars(c)
          } else if (event === 'done') {
            sawDone = true
          } else if (event === 'error' && payload && typeof payload === 'object' && 'message' in payload) {
            sawError = String((payload as { message?: string }).message ?? 'profiler error')
          }
        }
      }

      if (sawError) throw new Error(sawError)
      if (!sawDone) {
        // Stream endete ohne `done` → könnte sein, dass die DB-Persistenz
        // server-seitig trotzdem durchlief. Polling-Fallback.
        const ok = await pollUntilProfiled()
        if (!ok) throw new Error('Profil-Generation hat zu lange gedauert')
      }

      router.push('/coach')
      router.refresh()
    } catch (e: unknown) {
      // Streckenrest: vielleicht ist das Profil schon da, nur die Verbindung
      // tot. Vor dem Fehler-Anzeigen einmal pollen.
      const ok = await pollUntilProfiled(3).catch(() => false)
      if (ok) {
        router.push('/coach')
        router.refresh()
        return
      }
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      setFinalizing(false)
    }
  }

  if (finalizing) {
    return <FinalizingView chars={profilerChars} />
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
                autoFocus={!showFollowUp}
                value={rawOnly}
                onChange={e => setAnswer(e.target.value)}
                placeholder="In eigenen Worten …"
                rows={5}
                disabled={showFollowUp}
                className={showFollowUp ? 'opacity-60' : ''}
              />
              {/* Feste Nachfrage gemäss V3-Doc: erscheint nach Klick auf "Weiter"
                  bei Q4, Q21, Q30, Q33, Q40 */}
              {showFollowUp && q.followUp && (
                <div className="mt-4 card border-l-4 border-l-[var(--color-accent)] bg-[var(--color-accent-soft)]/30 anim-fade-up">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-[var(--color-accent)] text-lg leading-none">↳</span>
                    <p className="text-sm font-medium text-[var(--color-ink)]">
                      {q.followUp}
                    </p>
                  </div>
                  <textarea
                    autoFocus
                    value={followUpAnswer}
                    onChange={e => setFollowUpAnswer(e.target.value)}
                    placeholder="Konkreter beschreiben (optional) …"
                    rows={3}
                  />
                  <div className="mt-2 text-xs text-[var(--color-muted)]">
                    Klick „Weiter" um zu ergänzen oder leer lassen + „Weiter" um zu überspringen.
                  </div>
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

        {/* Hinweis auf feste Nachfragen — nur an den fünf markierten Stellen */}
        {q.followUp && !showFollowUp && (
          <div className="mt-4 text-xs text-[var(--color-muted)] text-right">
            Eine Nachfrage folgt nach „Weiter" ({FOLLOWUP_QUESTION_IDS.indexOf(q.id) + 1} / {TOTAL_FOLLOWUPS})
          </div>
        )}

        {/* Follow-up-Opt-in nur auf der letzten Frage anzeigen — dezent, kein Modal */}
        {isLast && !showFollowUp && (
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
            disabled={(index === 0 && !showFollowUp) || pending}
            className="btn btn-ghost"
          >
            Zurück
          </button>

          {isLast && !showFollowUp && !q.followUp ? (
            <button
              type="button"
              onClick={finalize}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              Profil erstellen →
            </button>
          ) : isLast && showFollowUp ? (
            <button
              type="button"
              onClick={() => { commitFollowUpAndProceed(); void finalize() }}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              {followUpAnswer.trim() ? 'Ergänzen & abschließen →' : 'Überspringen & abschließen →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              {showFollowUp
                ? (followUpAnswer.trim() ? 'Ergänzen & weiter →' : 'Überspringen →')
                : 'Weiter'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Polling-Fallback wenn der SSE-Stream wegen Netz / Tab-Suspend abreisst.
 * Pollt `/api/onboarding/status` bis der Server-Profiler durchgelaufen ist
 * (state='profiled') oder ein definitiver Fehler (state='failed') erreicht wird.
 *
 * Auch beim Erfolgspfad als Sicherheitsnetz: wenn der Stream sauber endet aber
 * irgendwo ein Event verschluckt wurde, holt das Polling den Endzustand nach.
 */
async function pollUntilProfiled(maxAttempts = 60): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const r = await fetch('/api/onboarding/status', { cache: 'no-store' })
      if (!r.ok) continue
      const { state } = await r.json() as { state?: string }
      if (state === 'profiled' || state === 'active') return true
      if (state === 'failed') return false
    } catch {
      // Netz-Hänger, weiter probieren
    }
  }
  return false
}

function FinalizingView({ chars }: { chars: number }) {
  // Heuristik: Opus 4.7 schreibt ein typisches Profil mit ca. 18-22k Chars.
  // Damit eine Progress-Bar plausibel füllt — bei Stagnation (langsamer Stream)
  // sieht der User trotzdem Bewegung über die Char-Anzeige.
  const ESTIMATED_TOTAL = 20000
  const pct = Math.min(95, Math.round((chars / ESTIMATED_TOTAL) * 100))
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin mb-6" />
      <h2 className="text-xl font-semibold tracking-tight mb-2">Dein Profil wird erstellt</h2>
      <p className="text-[var(--color-ink-2)] max-w-sm">
        Dein Coach-Profil wird aus deinen Antworten kalibriert.
        Das dauert in der Regel 1–3 Minuten — bitte den Tab offen lassen.
      </p>
      {chars > 0 && (
        <div className="mt-6 w-full max-w-xs">
          <div className="h-1.5 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-ink)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-[var(--color-muted)] tabular-nums">
            {chars.toLocaleString('de-DE')} Zeichen
          </div>
        </div>
      )}
    </div>
  )
}
