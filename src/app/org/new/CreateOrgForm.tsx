'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function CreateOrgForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [kThreshold, setKThreshold] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        industry: industry.trim() || null,
        k_anonymity_threshold: kThreshold,
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      try {
        const j = JSON.parse(t) as { error?: string }
        setError(j.error ?? `HTTP ${res.status}`)
      } catch {
        setError(t || `HTTP ${res.status}`)
      }
      return
    }
    const j = await res.json() as { ok: boolean; org?: { id: string } }
    if (j.ok && j.org?.id) {
      startTransition(() => {
        router.push(`/org/${j.org!.id}/manage`)
        router.refresh()
      })
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Name der Organisation</label>
        <input
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          placeholder="z. B. Mustermann GmbH"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Branche <span className="text-[var(--color-muted)] font-normal">(optional)</span></label>
        <input
          type="text"
          value={industry}
          onChange={e => setIndustry(e.target.value)}
          maxLength={60}
          placeholder="z. B. Maschinenbau, IT-Beratung"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">
          K-Anonymitäts-Schwelle
          <span className="ml-2 text-xs text-[var(--color-muted)] font-normal">
            min. 3, max. 50
          </span>
        </label>
        <input
          type="number"
          min={3}
          max={50}
          value={kThreshold}
          onChange={e => setKThreshold(parseInt(e.target.value) || 5)}
          className="w-32"
        />
        <p className="mt-1.5 text-xs text-[var(--color-muted)] leading-snug">
          Mindestanzahl aktiver Mitarbeitender, damit HR-Aggregate sichtbar
          werden. 5 ist der DSGVO-übliche Default. Höher = strenger.
        </p>
      </div>

      {error && (
        <div className="text-sm text-[var(--color-danger)]">{error}</div>
      )}

      <button
        type="submit"
        disabled={pending || name.trim().length < 2}
        className="btn btn-primary"
      >
        {pending ? 'Wird angelegt …' : 'Organisation anlegen →'}
      </button>
    </form>
  )
}
