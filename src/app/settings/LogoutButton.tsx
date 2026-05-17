'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function go() {
    setLoading(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <button type="button" onClick={go} disabled={loading} className="btn btn-secondary btn-block">
      {loading ? 'Abmelden …' : 'Abmelden'}
    </button>
  )
}
