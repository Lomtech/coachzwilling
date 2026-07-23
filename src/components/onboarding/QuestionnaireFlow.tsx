'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUESTIONS,
  questionsForPart,
  partOf,
  vertiefungQ4Prompt,
  type Question,
} from '@/data/questionnaire'

interface Props {
  initialAnswers: Record<string, string>
  initialIndex: number
  /**
   * 1     = kostenloser Teil-1-Scan (22 Fragen → Mini-Profil)
   * 2     = Teil 2 nach Kauf (Vertiefung + 28 Fragen → Vollprofil)
   * 'all' = Volltest am Stück (22 + Vertiefung + 28 = alle 50 → direkt Vollprofil,
   *         OHNE Mini-Zwischenstopp). Für alle, die schon VOR dem Fragebogen
   *         freigeschaltet haben — per Firmencode oder Kauf. Sonst müssten sie
   *         mitten im Durchlauf auf ein Kurzprofil warten, das sie nie wollten.
   * 'rest' = nur die noch UNBEANTWORTETEN Fragen. Für Bestandsnutzer, deren
   *         Fragebogen kürzer war (die 42er haben IDs 43–50 nie gesehen): sie
   *         ergänzen die Lücke und bekommen ein neues Vollprofil — ohne alles
   *         noch einmal von vorn zu beantworten.
   */
  part?: 1 | 2 | 'all' | 'rest'
}

// Ein Schritt im Flow: entweder eine echte Frage, oder — als Pflicht-Einstieg
// von Teil 2 — die Vertiefung zur Teil-1-Antwort auf Frage 4.
type Step =
  | { kind: 'question'; q: Question }
  | { kind: 'vertiefung' }

export function QuestionnaireFlow({ initialAnswers, initialIndex, part = 1 }: Props) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [index, setIndex] = useState(initialIndex)
  const [pending, startTransition] = useTransition()
  const [finalizing, setFinalizing] = useState(false)
  const [profilerChars, setProfilerChars] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Nachfrage-State (feste Nachfragen: Teil 1 an Q21; Teil 2 an Q30/Q33/Q40).
  // Dieselbe followUpAnswer-State trägt auch die Vertiefungs-Antwort von Teil 2.
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUpAnswer, setFollowUpAnswer] = useState('')

  // Opt-in für Follow-up-Mails — nur auf dem letzten Screen von Teil 1 (DSGVO, default false).
  const [followupOptIn, setFollowupOptIn] = useState(false)

  // Schritte dieses Teils. Teil 2 beginnt mit der Pflicht-Vertiefung zu Q4;
  // beim Volltest am Stück sitzt sie zwischen Teil 1 und Teil 2 (zitiert dann
  // die Q4-Antwort aus derselben Sitzung).
  const steps = useMemo<Step[]>(() => {
    const asStep = (x: Question) => ({ kind: 'question' as const, q: x })
    if (part === 'rest') {
      // Nur Lücken. Bewusst gegen die INITIALEN Antworten gerechnet, nicht gegen
      // den laufenden State — sonst verschwänden Schritte unter dem Nutzer,
      // sobald er sie beantwortet.
      return QUESTIONS.filter(x => !initialAnswers[String(x.id)]).map(asStep)
    }
    if (part === 'all') {
      return [
        ...questionsForPart(1).map(asStep),
        { kind: 'vertiefung' as const },
        ...questionsForPart(2).map(asStep),
      ]
    }
    const qs = questionsForPart(part).map(asStep)
    return part === 2 ? [{ kind: 'vertiefung' as const }, ...qs] : qs
  }, [part, initialAnswers])
  const TOTAL_STEPS = steps.length

  const safeIndex = Math.min(Math.max(0, index), TOTAL_STEPS - 1)
  const step = steps[safeIndex]
  const isVertiefung = step.kind === 'vertiefung'
  const q = step.kind === 'question' ? step.q : null

  // Zeigt eine Frage ihre feste Nachfrage inline?
  //  • Teil 1/2 : nur wenn die Nachfrage zu DIESEM Teil gehört.
  //  • 'all'    : alle inline — AUSSER Q4, dessen Nachfrage als eigener
  //               Vertiefungs-Schritt läuft (erkennbar am verschobenen
  //               followUpPart, das nicht zum Teil der Frage selbst passt).
  //  • 'rest'   : alle inline — die Q4-Vertiefung entfällt hier ganz (wer nur
  //               Lücken füllt, hat Q4 längst beantwortet).
  const inlineFollowUp = (x: Question) => {
    if (!x.followUp) return false
    const fuPart = x.followUpPart ?? partOf(x.id)
    if (part === 'all' || part === 'rest') return fuPart === partOf(x.id)
    return fuPart === part
  }
  const qHasFollowUp = !!q && inlineFollowUp(q)

  // Q4-Hauptantwort (aus Teil 1) — für das wörtliche Zitat im Vertiefungs-Einstieg.
  const q4main = (answers['4'] ?? '').split(/\s*\|\s*/)[0] ?? ''

  const rawAnswer = q ? (answers[String(q.id)] ?? '') : ''
  const rawOnly = rawAnswer.split(/\s*\|\s*/)[0]
  const answered = isVertiefung ? Boolean(followUpAnswer.trim()) : Boolean(rawAnswer)
  const progress = Math.round((safeIndex / TOTAL_STEPS) * 100)
  const isLast = safeIndex === TOTAL_STEPS - 1

  // Feste Nachfragen dieses Teils (für den Hinweis-Zähler).
  const followUpIdsInPart = useMemo(
    () =>
      steps.flatMap(s => {
        if (s.kind !== 'question' || !s.q.followUp) return []
        const fuPart = s.q.followUpPart ?? partOf(s.q.id)
        const inline = (part === 'all' || part === 'rest')
          ? fuPart === partOf(s.q.id)
          : fuPart === part
        return inline ? [s.q.id] : []
      }),
    [steps, part],
  )

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

  // Bei Schritt-Wechsel den Nachfrage-/Vertiefungs-State zurücksetzen und ggf.
  // bestehende Antworten (Resume) vorbefüllen.
  useEffect(() => {
    setShowFollowUp(false)
    if (isVertiefung) {
      // Vertiefung teilt sich answers["4"] mit der Q4-Hauptantwort ("main | vertiefung").
      const follow = (answers['4'] ?? '').split(/\s*\|\s*/)[1] ?? ''
      setFollowUpAnswer(follow)
    } else if (q) {
      const [, existingFollow] = (answers[String(q.id)] ?? '').split(/\s*\|\s*/)
      setFollowUpAnswer(existingFollow ?? '')
    }
    // Nur bei echtem Schritt-Wechsel neu initialisieren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex])

  function setAnswer(value: string) {
    if (!q) return
    setAnswers(prev => ({ ...prev, [String(q.id)]: value }))
  }

  // Vertiefungs-Antwort in answers["4"] als Nachfrage-Teil ablegen ("main | vertiefung").
  function commitVertiefungAndProceed() {
    const supplement = followUpAnswer.trim()
    setAnswers(prev => {
      const main = (prev['4'] ?? '').split(/\s*\|\s*/)[0] ?? ''
      return { ...prev, '4': supplement ? `${main} | ${supplement}` : main }
    })
    proceedToNext()
  }

  function commitFollowUpAndProceed() {
    const supplement = followUpAnswer.trim()
    const combined = supplement ? `${rawOnly.trim()} | ${supplement}` : rawOnly.trim()
    setAnswer(combined)
    setShowFollowUp(false)
    setFollowUpAnswer('')
    proceedToNext()
  }

  function proceedToNext() {
    if (isLast) return
    startTransition(() => setIndex(i => Math.min(TOTAL_STEPS - 1, i + 1)))
  }

  function next() {
    if (!answered) return
    if (isVertiefung) { commitVertiefungAndProceed(); return }
    if (showFollowUp) { commitFollowUpAndProceed(); return }
    if (qHasFollowUp) { setShowFollowUp(true); return }
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
        // 'all' wird serverseitig wie Teil 2 ausgewertet (Voll-Auswertung über
        // alle 50). Das Gate dort prüft full_unlocked — die Mini-Kontinuität ist
        // optional und fehlt bei diesem Weg schlicht, weil es kein Mini gab.
        // 'all' und 'rest' werden serverseitig wie Teil 2 ausgewertet (Voll-
        // Auswertung über alle 50). Das Gate dort prüft full_unlocked bzw.
        // grandfathered; die Mini-Kontinuität ist optional.
        body: JSON.stringify({
          answers,
          followupOptIn,
          part: (part === 'all' || part === 'rest') ? 2 : part,
        }),
      })
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `HTTP ${res.status}`)
      }

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
        const ok = await pollUntilProfiled()
        if (!ok) throw new Error('Profil-Generation hat zu lange gedauert')
      }

      router.push('/coach')
      router.refresh()
    } catch (e: unknown) {
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
    return <FinalizingView chars={profilerChars} part={part === 1 ? 1 : 2} />
  }

  const isFullRun = part === 2 || part === 'all' || part === 'rest'
  const finishLabel = part === 'rest'
    ? 'Profil aktualisieren →'
    : isFullRun ? 'Vollprofil erstellen →' : 'Kurz-Profil erstellen →'
  const sectionLabel = isVertiefung
    ? (part === 'all' ? 'Vertiefung' : 'Teil 2 · Vertiefung')
    : q!.section

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Progress bar */}
      <div className="px-5 pt-5 pb-3 max-w-xl w-full mx-auto">
        <div className="flex items-center justify-between text-xs text-[var(--color-muted)] mb-2">
          <span>{sectionLabel}</span>
          <span>{safeIndex + 1} / {TOTAL_STEPS}</span>
        </div>
        <div className="h-1.5 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-ink)] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question / Vertiefung */}
      <div className="flex-1 px-5 pt-6 pb-32 max-w-xl w-full mx-auto">
        {isVertiefung ? (
          <>
            <div className="text-xs text-[var(--color-accent)] font-semibold uppercase tracking-wider mb-2">
              Der bezahlte Teil beginnt hier — direkt in der Tiefe.
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight">
              {vertiefungQ4Prompt(q4main)}
            </h1>
            <div className="mt-7">
              <textarea
                autoFocus
                value={followUpAnswer}
                onChange={e => setFollowUpAnswer(e.target.value)}
                placeholder="In eigenen Worten …"
                rows={5}
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl sm:text-2xl font-semibold leading-snug tracking-tight">
              {q!.prompt}
            </h1>
            {q!.helper && <p className="mt-3 text-sm text-[var(--color-ink-2)]">{q!.helper}</p>}

            <div className="mt-7 space-y-2.5">
              {q!.type === 'open' ? (
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
                  {/* Feste Nachfrage: erscheint nach „Weiter" an den markierten Stellen dieses Teils */}
                  {showFollowUp && qHasFollowUp && (
                    <div className="mt-4 card border-l-4 border-l-[var(--color-accent)] bg-[var(--color-accent-soft)]/30 anim-fade-up">
                      <div className="flex items-start gap-2 mb-3">
                        <span className="text-[var(--color-accent)] text-lg leading-none">↳</span>
                        <p className="text-sm font-medium text-[var(--color-ink)]">{q!.followUp}</p>
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
                q!.options!.map(opt => {
                  const selected = answers[String(q!.id)] === opt.value
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
          </>
        )}

        {error && <div className="mt-4 text-sm text-[var(--color-danger)]">{error}</div>}

        {/* Hinweis auf feste Nachfragen — nur an den markierten Stellen dieses Teils */}
        {qHasFollowUp && !showFollowUp && (
          <div className="mt-4 text-xs text-[var(--color-muted)] text-right">
            Eine Nachfrage folgt nach „Weiter" ({followUpIdsInPart.indexOf(q!.id) + 1} / {followUpIdsInPart.length})
          </div>
        )}

        {/* Follow-up-Opt-in auf dem letzten Screen des Durchlaufs (Teil 1 bzw. Volltest) */}
        {(part === 1 || part === 'all') && isLast && !showFollowUp && (
          <label className="mt-8 flex items-start gap-3 p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 cursor-pointer hover:bg-[var(--color-surface-2)] transition">
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

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg)]/90 backdrop-blur border-t border-[var(--color-border)] safe-bottom">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={(safeIndex === 0 && !showFollowUp) || pending}
            className="btn btn-ghost"
          >
            Zurück
          </button>

          {isLast && !showFollowUp && !qHasFollowUp ? (
            <button
              type="button"
              onClick={finalize}
              disabled={!answered || pending}
              className="btn btn-primary flex-1"
            >
              {finishLabel}
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

function FinalizingView({ chars, part }: { chars: number; part: 1 | 2 }) {
  const ESTIMATED_TOTAL = part === 2 ? 20000 : 8000
  const pct = Math.min(95, Math.round((chars / ESTIMATED_TOTAL) * 100))
  const title = part === 2 ? 'Dein vollständiges Profil wird erstellt' : 'Dein Kurz-Profil wird erstellt'
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-full border-4 border-[var(--color-surface-2)] border-t-[var(--color-ink)] animate-spin mb-6" />
      <h2 className="text-xl font-semibold tracking-tight mb-2">{title}</h2>
      <p className="text-[var(--color-ink-2)] max-w-sm">
        {part === 2
          ? 'Dein Coach-Profil wird aus allen Antworten neu kalibriert. Das dauert in der Regel 1–3 Minuten — bitte den Tab offen lassen.'
          : 'Dein Coach-Profil wird aus deinen Antworten kalibriert. Das dauert meist unter einer Minute — bitte den Tab offen lassen.'}
      </p>
      {chars > 0 && (
        <div className="mt-6 w-full max-w-xs">
          <div className="h-1.5 w-full bg-[var(--color-surface-2)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-ink)] transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-[var(--color-muted)] tabular-nums">
            {chars.toLocaleString('de-DE')} Zeichen
          </div>
        </div>
      )}
    </div>
  )
}
