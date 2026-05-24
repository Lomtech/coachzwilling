'use client'

import { useState } from 'react'

interface Props {
  initialEnabled: boolean
  initialToken: string | null
}

/**
 * Settings-Karte um den Read-only Share-Link für das Profil zu aktivieren,
 * zu kopieren, zu rotieren oder zu deaktivieren. Nutzungsfall: User schickt
 * den Link an Coach/GF zur gemeinsamen Besprechung.
 */
export function ShareProfileSection({ initialEnabled, initialToken }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [token, setToken] = useState<string | null>(initialEnabled ? initialToken : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/p/${token}` : null

  async function enable(rotate = false) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/coach/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotate }),
      })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; token?: string; error?: string }
        | null
      if (!res.ok || !json?.token) throw new Error(json?.error ?? 'Share fehlgeschlagen')
      setToken(json.token)
      setEnabled(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/coach/share', { method: 'DELETE' })
      if (!res.ok) throw new Error('Deaktivieren fehlgeschlagen')
      setEnabled(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <section className="card mb-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
        Profil teilen
      </h2>
      <p className="text-sm text-[var(--color-ink-2)] mb-3">
        Erzeuge einen Read-only Link zu deinem Profil — z. B. um es mit einem
        Coach oder Geschäftspartner gemeinsam zu besprechen. Du kannst den Link
        jederzeit deaktivieren oder den Token rotieren.
      </p>

      {!enabled ? (
        <button
          onClick={() => enable(false)}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? 'Erstelle Link …' : 'Share-Link erstellen'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={url ?? ''}
              readOnly
              className="font-mono text-xs"
              onFocus={e => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyLink}
              className="btn btn-secondary text-sm px-3 py-2"
            >
              {copied ? '✓' : 'Kopieren'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => enable(true)}
              disabled={busy}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] underline underline-offset-2"
            >
              Token rotieren (alter Link wird ungültig)
            </button>
            <span className="text-[var(--color-muted)]">·</span>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-xs text-[var(--color-danger)] hover:opacity-80 underline underline-offset-2"
            >
              Link deaktivieren
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </section>
  )
}
