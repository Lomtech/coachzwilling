'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface MemberRow {
  userId: string
  email: string
  fullName: string | null
  role: 'owner' | 'hr_admin' | 'member'
  joinedAt: string
}

const ROLE_LABEL: Record<MemberRow['role'], string> = {
  owner: 'Owner',
  hr_admin: 'HR-Admin',
  member: 'Mitglied',
}

export function ManageMembers({
  orgId,
  currentUserId,
  callerIsOwner,
  members,
}: {
  orgId: string
  currentUserId: string
  callerIsOwner: boolean
  members: MemberRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function changeRole(userId: string, role: MemberRow['role']) {
    setBusyId(userId)
    try {
      const res = await fetch(`/api/org/${orgId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const t = await res.text()
        alert(t || `HTTP ${res.status}`)
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setBusyId(null)
    }
  }

  async function removeMember(userId: string, isSelf: boolean) {
    const msg = isSelf
      ? 'Möchtest du dich wirklich aus dieser Organisation entfernen?'
      : 'Mitglied wirklich aus der Organisation entfernen?'
    if (!confirm(msg)) return
    setBusyId(userId)
    try {
      const res = await fetch(`/api/org/${orgId}/members/${userId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        alert((await res.text()) || `HTTP ${res.status}`)
        return
      }
      if (isSelf) {
        router.push('/org')
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {members.map(m => {
        const isSelf = m.userId === currentUserId
        const canChangeRole = callerIsOwner && !isSelf
        const canRemove = callerIsOwner || isSelf
        const busy = busyId === m.userId || pending
        return (
          <li key={m.userId} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {m.fullName ?? m.email}
                {isSelf && <span className="ml-2 text-xs text-[var(--color-muted)] font-normal">(du)</span>}
              </div>
              <div className="text-xs text-[var(--color-muted)] truncate">{m.email}</div>
            </div>

            {canChangeRole ? (
              <select
                value={m.role}
                onChange={e => changeRole(m.userId, e.target.value as MemberRow['role'])}
                disabled={busy}
                className="text-sm"
              >
                <option value="member">Mitglied</option>
                <option value="hr_admin">HR-Admin</option>
                <option value="owner">Owner</option>
              </select>
            ) : (
              <span className="text-xs text-[var(--color-muted)] shrink-0">{ROLE_LABEL[m.role]}</span>
            )}

            {canRemove && (
              <button
                type="button"
                onClick={() => removeMember(m.userId, isSelf)}
                disabled={busy}
                className="text-sm text-[var(--color-danger)] hover:underline shrink-0"
              >
                {isSelf ? 'Verlassen' : 'Entfernen'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
