'use client'

import { useState } from 'react'

interface Props {
  showPrompt: boolean       // genug Coach-Antworten erreicht → freundlicher Nudge
  alreadySubmitted: boolean // schon mindestens 1 Testimonial gegeben
  defaultName: string | null
}

/**
 * Testimonials sind aus Block 3.2 des Projektplans:
 * "Kein allgemeines Lob — 'Ich habe X entschieden, weil...'".
 * Daher fragen wir explizit nach einer ENTSCHEIDUNG, nicht nach Feedback.
 */
export function TestimonialSection({ showPrompt, alreadySubmitted, defaultName }: Props) {
  const [open, setOpen] = useState(false)
  const [decision, setDecision] = useState('')
  const [context, setContext] = useState('')
  const [allowPublish, setAllowPublish] = useState(false)
  const [displayName, setDisplayName] = useState(defaultName ?? '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: decision.trim(),
          context: context.trim() || null,
          allowPublish,
          displayName: allowPublish ? displayName.trim() : null,
        }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? 'Senden fehlgeschlagen')
      setDone(true)
      setDecision('')
      setContext('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="card mb-4 bg-[var(--color-success)]/5 border-[var(--color-success)]/30">
        <div className="text-sm">
          ✓ Danke. Wir lesen jede Rückmeldung persönlich und das hilft uns
          enorm, den Coach zu schärfen.
        </div>
      </section>
    )
  }

  if (!showPrompt && !alreadySubmitted) {
    // Noch zu früh — Section nicht zeigen
    return null
  }

  if (!open) {
    return (
      <section className="card mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
          Was hat das Coaching bei dir bewegt?
        </h2>
        <p className="text-sm text-[var(--color-ink-2)] mb-3">
          {alreadySubmitted
            ? 'Du hast schon einmal geteilt was sich verändert hat. Magst du ein weiteres konkretes Beispiel ergänzen?'
            : 'Wenn dir der Coach in den letzten Gesprächen geholfen hat eine konkrete Entscheidung zu treffen, magst du es kurz beschreiben? Wir lesen jede Rückmeldung persönlich.'}
        </p>
        <button onClick={() => setOpen(true)} className="btn btn-secondary text-sm px-3 py-2">
          Entscheidung beschreiben
        </button>
      </section>
    )
  }

  return (
    <section className="card mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
        Deine Entscheidung
      </h2>

      <label className="block text-sm font-medium mb-1">Was hast du entschieden oder verändert?</label>
      <textarea
        value={decision}
        onChange={e => setDecision(e.target.value)}
        placeholder="Ich habe X entschieden, weil… / Ich habe aufgehört Y zu tun, weil…"
        rows={4}
      />

      <label className="block text-sm font-medium mb-1 mt-3">Kontext (optional)</label>
      <textarea
        value={context}
        onChange={e => setContext(e.target.value)}
        placeholder="In welcher Situation? Was hat der Coach gefragt/gesagt, das den Ausschlag gab?"
        rows={3}
      />

      <div className="mt-4 pt-3 border-t border-[var(--color-border)] space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={allowPublish}
            onChange={e => setAllowPublish(e.target.checked)}
          />
          <span>Diese Rückmeldung darf (anonymisiert oder mit meinem Namen) als Testimonial veröffentlicht werden.</span>
        </label>

        {allowPublish && (
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Name oder Rolle wie wir dich nennen dürfen (z. B. 'Markus, GF Mittelstand')"
            className="text-sm"
          />
        )}
      </div>

      {error && <div className="mt-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={submit}
          disabled={busy || decision.trim().length < 10}
          className="btn btn-primary text-sm px-3 py-2"
        >
          {busy ? 'Sende …' : 'Senden'}
        </button>
        <button onClick={() => setOpen(false)} className="btn btn-ghost text-sm px-3 py-2">
          Später
        </button>
      </div>
    </section>
  )
}
