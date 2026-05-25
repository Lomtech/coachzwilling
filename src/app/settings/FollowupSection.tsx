'use client'

import { useState } from 'react'

interface Props {
  initialEnabled: boolean
  initialFrequencyDays: number
  lastSent: string | null
  recentMails: Array<{
    id: string
    subject: string
    sent_at: string | null
    opened_at: string | null
    clicked_at: string | null
  }>
}

/**
 * Settings-Karte für Follow-up-Emails.
 *
 * UI-Logik:
 * - Master-Toggle (an/aus)
 * - Wenn an: Frequenz-Slider (1-14 Tage Default-Range)
 * - Liste der letzten 5 gesendeten Mails mit Open/Click-Indikator
 */
export function FollowupSection({ initialEnabled, initialFrequencyDays, lastSent, recentMails }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [freq, setFreq] = useState(initialFrequencyDays)
  const [savingEnabled, setSavingEnabled] = useState(false)
  const [savingFreq, setSavingFreq] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleEnabled() {
    const next = !enabled
    setEnabled(next) // optimistic
    setSavingEnabled(true)
    setError(null)
    try {
      const res = await fetch('/api/followups/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        setEnabled(!next) // rollback
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Speichern fehlgeschlagen')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setSavingEnabled(false)
    }
  }

  async function saveFreq(newFreq: number) {
    setFreq(newFreq)
    setSavingFreq(true)
    setError(null)
    try {
      const res = await fetch('/api/followups/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequencyDays: newFreq }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Speichern fehlgeschlagen')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setSavingFreq(false)
    }
  }

  return (
    <section className="card mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
        Follow-up-Emails
      </h2>
      <p className="text-sm text-[var(--color-ink-2)] mb-4">
        Dein Coach schickt dir in regelmäßigen Abständen eine kurze Mail
        — knüpft an offene Punkte aus euren Gesprächen an, fragt nach Status
        und gibt dir Anstöße. Kein Newsletter, sondern Coaching-Fortsetzung.
      </p>

      {/* Toggle */}
      <div className="flex items-center justify-between py-3 border-y border-[var(--color-border)]">
        <div>
          <div className="text-sm font-medium">Aktiv</div>
          <div className="text-xs text-[var(--color-muted)] mt-0.5">
            {enabled ? 'Du bekommst Follow-up-Mails' : 'Pausiert — keine Mails'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={savingEnabled}
          className={
            'relative inline-flex h-6 w-11 items-center rounded-full transition ' +
            (enabled ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-surface-2)] border border-[var(--color-border)]')
          }
          aria-pressed={enabled}
          aria-label="Follow-up-Mails aktivieren"
        >
          <span
            className={
              'inline-block h-4 w-4 rounded-full bg-white shadow transition transform ' +
              (enabled ? 'translate-x-6' : 'translate-x-1')
            }
          />
        </button>
      </div>

      {/* Frequenz */}
      {enabled && (
        <div className="py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Frequenz</span>
            <span className="text-sm text-[var(--color-muted)]">
              alle {freq} {freq === 1 ? 'Tag' : 'Tage'}
              {savingFreq && <span className="ml-1">…</span>}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={14}
            step={1}
            value={freq}
            onChange={(e) => setFreq(Number(e.target.value))}
            onMouseUp={() => saveFreq(freq)}
            onTouchEnd={() => saveFreq(freq)}
            onKeyUp={(e) => { if (e.key === 'Enter') saveFreq(freq) }}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
            <span>täglich</span>
            <span>wöchentlich</span>
            <span>zwei-wöchentlich</span>
          </div>
        </div>
      )}

      {/* Recent Mails */}
      {recentMails.length > 0 && (
        <div className="pt-3">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
            Zuletzt gesendet
          </div>
          <ul className="space-y-1.5">
            {recentMails.map((m) => (
              <li key={m.id} className="text-sm flex items-center justify-between gap-2 py-1">
                <span className="flex-1 truncate">
                  <span className="text-[var(--color-ink)]">{m.subject}</span>
                </span>
                <span className="text-xs text-[var(--color-muted)] shrink-0 flex items-center gap-1.5">
                  {m.sent_at && (
                    <span title={m.sent_at}>
                      {new Date(m.sent_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}
                  {m.opened_at && <span title="Geöffnet" className="text-[var(--color-success)]">●</span>}
                  {m.clicked_at && <span title="Geklickt" className="text-[var(--color-accent)]">↳</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!enabled && lastSent && (
        <p className="text-xs text-[var(--color-muted)] mt-3">
          Letzte Mail vor {Math.floor((Date.now() - new Date(lastSent).getTime()) / 86_400_000)} Tagen.
        </p>
      )}

      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </section>
  )
}
