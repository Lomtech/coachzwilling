'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface MemoryItem {
  id: string
  section: string
  section_label: string
  observation: string
  importance: number
  created_at: string
}

export function MemoryView({ initialItems }: { initialItems: MemoryItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [pending, startTransition] = useTransition()
  const [confirmAll, setConfirmAll] = useState(false)

  async function deleteOne(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch('/api/memory/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    startTransition(() => router.refresh())
  }

  async function deleteAll() {
    setItems([])
    setConfirmAll(false)
    await fetch('/api/memory/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    startTransition(() => router.refresh())
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-2)]">
        Dein Coach hat noch keine Beobachtungen gespeichert. Sobald du anfängst zu chatten,
        baut er hier ein lebendiges Profil von dir auf — strukturiert nach 9 Sektionen.
      </p>
    )
  }

  // Gruppiert nach Sektion
  const grouped = new Map<string, MemoryItem[]>()
  for (const item of items) {
    if (!grouped.has(item.section_label)) grouped.set(item.section_label, [])
    grouped.get(item.section_label)!.push(item)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--color-ink-2)]">
        Was dein Coach über dich gelernt hat. Wächst nach jedem Gespräch. Du kannst Einträge
        jederzeit löschen.
      </p>

      {[...grouped.entries()].map(([label, group]) => (
        <div key={label}>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
            {label}
          </div>
          <ul className="space-y-2">
            {group.map(item => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex-1 text-[var(--color-ink-2)]">{item.observation}</span>
                <button
                  type="button"
                  onClick={() => deleteOne(item.id)}
                  disabled={pending}
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] shrink-0"
                  aria-label="Diesen Eintrag löschen"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="pt-4 border-t border-[var(--color-border)]">
        {confirmAll ? (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-[var(--color-warning)]">Alle löschen?</span>
            <button onClick={deleteAll} className="btn btn-secondary text-sm px-3 py-1">Ja, alles weg</button>
            <button onClick={() => setConfirmAll(false)} className="btn btn-ghost text-sm px-3 py-1">Abbrechen</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmAll(true)}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          >
            Alles vergessen — kompletten Memory löschen
          </button>
        )}
      </div>
    </div>
  )
}
