'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function RevokeInviteButton({
  orgId,
  invitationId,
}: {
  orgId: string
  invitationId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function revoke() {
    if (!confirm('Einladung wirklich zurückziehen?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/org/${orgId}/invitations/${invitationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        alert((await res.text()) || `HTTP ${res.status}`)
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={busy || pending}
      className="text-sm text-[var(--color-danger)] hover:underline shrink-0"
    >
      Zurückziehen
    </button>
  )
}
