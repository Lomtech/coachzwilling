'use client'

import { useState } from 'react'

interface ProfileItem {
  id: string
  version: number
  source: string
  generatedAt: string
  configMd: string
}

export function ProfileViewer({ profile }: { profile: ProfileItem | null }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!profile) {
    return (
      <p className="text-sm text-[var(--color-ink-2)]">
        Noch kein Profil — fülle erst den Onboarding-Fragebogen aus.
      </p>
    )
  }

  async function copy() {
    await navigator.clipboard.writeText(profile!.configMd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function download() {
    const blob = new Blob([profile!.configMd], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coach-profil-v${profile!.version}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm font-medium text-[var(--color-accent)] hover:underline underline-offset-2 inline-flex items-center gap-1"
      >
        {open ? '▾' : '▸'} Mein Coach-Profil ansehen
      </button>

      {open && (
        <div className="mt-4">
          <div className="flex gap-2 mb-3">
            <button onClick={copy} className="btn btn-secondary text-xs px-3 py-1">
              {copied ? '✓ Kopiert' : 'Kopieren'}
            </button>
            <button onClick={download} className="btn btn-secondary text-xs px-3 py-1">
              Als .md herunterladen
            </button>
          </div>
          <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-2)] p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--color-ink)]">
              {profile.configMd}
            </pre>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Dies ist die interne Konfiguration, die dein Coach bei jeder Antwort als Wissensbasis
            erhält. Du kannst sie kopieren, herunterladen oder via „Profil auffrischen" mit Chat-Erkenntnissen aktualisieren.
          </p>
        </div>
      )}
    </div>
  )
}
