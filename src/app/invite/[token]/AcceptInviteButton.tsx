'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean
        orgId?: string
        error?: string
      }
      if (!res.ok || !body.ok || !body.orgId) {
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      router.push('/org')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="btn btn-primary btn-block"
      >
        {busy ? 'Wird angenommen …' : 'Einladung annehmen'}
      </button>
      {error && (
        <div className="mt-3 text-sm text-[var(--color-danger)]">{error}</div>
      )}
    </div>
  )
}
