'use client'

import { useState } from 'react'
import { IconFileText, IconEyeOff, IconCopy, IconDownload, IconCheck } from '@/components/Icons'

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
        className="btn btn-secondary btn-block flex items-center justify-center gap-2"
        aria-expanded={open}
      >
        {open ? <IconEyeOff className="w-4 h-4" /> : <IconFileText className="w-4 h-4" />}
        <span>{open ? 'Profil ausblenden' : 'Mein Coach-Profil ansehen'}</span>
      </button>

      {open && (
        <div className="mt-4 anim-fade-up">
          <div className="flex gap-2 mb-3">
            <button onClick={copy} className="btn btn-ghost text-xs px-3 py-1 inline-flex items-center gap-1.5">
              {copied ? <IconCheck className="w-3.5 h-3.5" /> : <IconCopy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
            </button>
            <button onClick={download} className="btn btn-ghost text-xs px-3 py-1 inline-flex items-center gap-1.5">
              <IconDownload className="w-3.5 h-3.5" />
              <span>Als .md herunterladen</span>
            </button>
          </div>
          <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-2)] p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--color-ink)]">
              {profile.configMd}
            </pre>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Das ist die vollständige interne Konfiguration, die dein Coach bei jeder Antwort
            kennt. Sektionen 10 + 11 (Tonprofil-Echo + Sprach-Mirror) bekommen im System-Prompt
            zusätzlich die höchste Priorität.
          </p>
        </div>
      )}
    </div>
  )
}
