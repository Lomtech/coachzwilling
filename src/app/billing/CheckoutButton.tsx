'use client'

import { useState } from 'react'

export function CheckoutButton({
  plan, ctaText, isLoggedIn = true,
}: {
  plan: 'monthly' | 'yearly' | 'test' | 'full'
  ctaText?: string
  isLoggedIn?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    // Nicht eingeloggt → erst Signup, danach automatisch zurück zu /billing
    if (!isLoggedIn) {
      window.location.href = `/signup?next=${encodeURIComponent('/billing?plan=' + plan)}`
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      // Unauthorized → wahrscheinlich Session abgelaufen
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/billing?plan=' + plan)}`
        return
      }
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Checkout fehlgeschlagen')
      window.location.href = json.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setLoading(false)
    }
  }

  const defaultCta =
    plan === 'yearly' ? 'Jährlich starten →' :
    plan === 'test'   ? 'Test-Charge (1 €) starten →' :
    plan === 'full'   ? 'Rohprofil freischalten — 149 €' :
                        'Monatlich starten →'

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="btn btn-primary btn-block"
      >
        {loading ? 'Weiterleitung …' : ctaText ?? defaultCta}
      </button>
      {error && <div className="mt-2 text-sm text-[var(--color-danger)]">{error}</div>}
    </>
  )
}
