'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  email: string
  fullName: string | null
  isAdmin: boolean
  showTrialPill?: boolean
  trialDaysLeft?: number
}

export function AccountMenu({ email, fullName, isAdmin, showTrialPill, trialDaysLeft }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  // Click-Counter mit eigenem Doppelklick-Fenster (500ms). Robuster als
  // native onDoubleClick — der CDP-Pfad in Tests + langsame Touch-Doppeltaps
  // verfehlen sonst das Browser-eigene dblclick-Timing.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickAt = useRef(0)
  const handleClick = () => {
    const now = Date.now()
    const diff = now - lastClickAt.current
    console.log('[AccountMenu] click', { diff, lastClickAt: lastClickAt.current, now })
    if (lastClickAt.current > 0 && diff < 500) {
      if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
      lastClickAt.current = 0
      setOpen(o => !o)
    } else {
      lastClickAt.current = now
      clickTimer.current = setTimeout(() => { lastClickAt.current = 0 }, 500)
    }
  }

  // Außenklick schließt
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // ESC schließt
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const initials = (fullName ?? email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || '?'

  const displayName = fullName ?? email.split('@')[0]

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(o => !o)
          }
        }}
        className={
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ' +
          (open ? 'bg-[var(--color-surface-2)]' : 'hover:bg-[var(--color-surface-2)]')
        }
        aria-haspopup="menu"
        aria-expanded={open}
        title="Doppelklick oder Enter zum Öffnen"
      >
        <div className="w-8 h-8 rounded-full bg-[var(--color-ink)] text-white flex items-center justify-center text-xs font-semibold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-ink)] truncate">{displayName}</div>
          {showTrialPill && trialDaysLeft && trialDaysLeft > 0 ? (
            <div className="text-xs text-[var(--color-accent)] truncate">
              🎁 noch {trialDaysLeft} {trialDaysLeft === 1 ? 'Tag' : 'Tage'} gratis
            </div>
          ) : (
            <div className="text-xs text-[var(--color-muted)] truncate">{email}</div>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          className={'text-[var(--color-muted)] shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden z-40"
        >
          <MenuLink href="/coach" icon="💬" label="Coach" onClick={() => setOpen(false)} />
          <MenuLink href="/settings" icon="⚙︎" label="Einstellungen" onClick={() => setOpen(false)} />
          <MenuLink href="/billing" icon="◆" label="Abo & Preise" onClick={() => setOpen(false)} />

          {isAdmin && (
            <>
              <div className="border-t border-[var(--color-border)] my-1" />
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-warning)] font-semibold">
                Admin
              </div>
              <MenuLink href="/admin" icon="🔧" label="Admin-Übersicht" onClick={() => setOpen(false)} accent />
              <MenuLink href="/admin/compare" icon="⇆" label="Profile vergleichen" onClick={() => setOpen(false)} accent />
            </>
          )}

          <div className="border-t border-[var(--color-border)] my-1" />
          <button
            type="button"
            onClick={logout}
            role="menuitem"
            className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--color-surface-2)] text-[var(--color-ink-2)] flex items-center gap-2"
          >
            <span className="opacity-60">↪</span>
            <span>Abmelden</span>
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({
  href, icon, label, onClick, accent = false,
}: { href: string; icon: string; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={
        'flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-[var(--color-surface-2)] ' +
        (accent ? 'text-[var(--color-warning)]' : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]')
      }
    >
      <span className={accent ? '' : 'opacity-60'}>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}
