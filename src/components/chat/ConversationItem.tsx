'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  id: string
  title: string | null
  active: boolean
}

/**
 * Eine Zeile in der Coach-Sidebar:
 * - Klick auf den Titel: navigiert zur Conversation
 * - Hover: kleines × erscheint rechts
 * - × klicken: zeigt inline-Confirm "Löschen?" mit "Ja / Abbrechen"
 * - Bei Bestätigung: DELETE /api/conversations/:id → router.refresh()
 *   Wenn die aktive Conv gelöscht wird: zur leeren /coach navigieren.
 */
export function ConversationItem({ id, title, active }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? 'Löschen fehlgeschlagen')
      }
      if (active) {
        // Aktive Conv gelöscht → frischer Start
        router.push('/coach')
      } else {
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
      setBusy(false)
    }
  }

  // Confirm-State: kompakter Inline-Block statt Modal — fühlt sich nativer an
  if (confirming) {
    return (
      <div
        className={
          'group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm ' +
          (active
            ? 'bg-[var(--color-ink)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-ink-2)]')
        }
      >
        <span className="truncate text-xs">Löschen?</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={doDelete}
            disabled={busy}
            className={
              'text-xs px-2 py-0.5 rounded ' +
              (active
                ? 'bg-white/15 hover:bg-white/25'
                : 'bg-[var(--color-danger)] text-white hover:opacity-90')
            }
            aria-label="Löschen bestätigen"
          >
            {busy ? '…' : 'Ja'}
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(false) }}
            disabled={busy}
            className={
              'text-xs px-2 py-0.5 rounded ' +
              (active
                ? 'bg-white/15 hover:bg-white/25'
                : 'hover:bg-[var(--color-surface-2)] text-[var(--color-muted)]')
            }
            aria-label="Abbrechen"
          >
            ✕
          </button>
        </div>
        {error && (
          <span className="text-[10px] text-[var(--color-danger)] ml-1 truncate">{error}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={
        'group flex items-center gap-1 rounded-xl ' +
        (active ? 'bg-[var(--color-ink)] text-white' : 'hover:bg-white')
      }
    >
      <Link
        href={`/coach?c=${id}`}
        prefetch={true}
        className={
          'flex-1 min-w-0 px-3 py-2.5 text-sm truncate ' +
          (active ? 'text-white' : 'text-[var(--color-ink-2)]')
        }
      >
        {title ?? 'Gespräch'}
      </Link>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
        className={
          'mr-1.5 px-1.5 py-0.5 rounded text-xs opacity-0 group-hover:opacity-100 transition ' +
          (active
            ? 'text-white/70 hover:text-white hover:bg-white/15'
            : 'text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-2)]')
        }
        aria-label="Gespräch löschen"
        title="Löschen"
      >
        ✕
      </button>
    </div>
  )
}
