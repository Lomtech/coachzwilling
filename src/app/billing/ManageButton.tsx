'use client'

import { useState } from 'react'

export function ManageButton() {
  const [loading, setLoading] = useState(false)

  async function go() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const json = (await res.json()) as { url?: string }
      if (json.url) window.location.href = json.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={go} disabled={loading} className="btn btn-secondary btn-block">
      {loading ? 'Öffne Portal …' : 'Abo verwalten'}
    </button>
  )
}
