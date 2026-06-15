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

/**
 * Mini-Markdown → JSX-Renderer. Reicht für V5-Profile (Header, Listen, Bold).
 * Bewusst keine Lib damit kein extra Bundle. Wenn Profile komplexer werden
 * → marked/react-markdown ziehen.
 */
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let listBuf: React.ReactNode[] = []

  const flushList = () => {
    if (listBuf.length > 0) {
      out.push(<ul key={`ul-${out.length}`}>{listBuf}</ul>)
      listBuf = []
    }
  }

  const renderInline = (text: string): React.ReactNode => {
    // Split by **bold** segments
    const parts: React.ReactNode[] = []
    let rest = text
    let key = 0
    while (rest.length > 0) {
      const m = rest.match(/^(.*?)\*\*(.+?)\*\*(.*)$/)
      if (m) {
        if (m[1]) parts.push(<span key={key++}>{m[1]}</span>)
        parts.push(<strong key={key++}>{m[2]}</strong>)
        rest = m[3]
      } else {
        parts.push(<span key={key++}>{rest}</span>)
        break
      }
    }
    return parts
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^#\s+/.test(line)) {
      flushList()
      out.push(<h1 key={i}>{renderInline(line.replace(/^#\s+/, ''))}</h1>)
    } else if (/^##\s+/.test(line)) {
      flushList()
      out.push(<h2 key={i}>{renderInline(line.replace(/^##\s+/, ''))}</h2>)
    } else if (/^###\s+/.test(line)) {
      flushList()
      out.push(<h3 key={i}>{renderInline(line.replace(/^###\s+/, ''))}</h3>)
    } else if (/^[-*]\s+/.test(line)) {
      listBuf.push(<li key={i}>{renderInline(line.replace(/^[-*]\s+/, ''))}</li>)
    } else if (line.trim() === '') {
      flushList()
      out.push(<div key={i} className="h-2" />)
    } else if (/^---+$/.test(line.trim())) {
      flushList()
      out.push(<hr key={i} />)
    } else {
      flushList()
      out.push(<p key={i}>{renderInline(line)}</p>)
    }
  }
  flushList()
  return out
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

  function printAsPdf() {
    // Browser-Print-Dialog. macOS hat "Als PDF sichern" als Standard-Option,
    // Windows kann "Microsoft Print to PDF", Chrome hat "Save as PDF" als Ziel.
    // CSS-Print-Stylesheet in globals.css regelt das Layout (Garamond, A4,
    // alles andere ausgeblendet).
    window.print()
  }

  const generatedDate = new Date(profile.generatedAt).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="btn btn-secondary btn-block flex items-center justify-center gap-2 no-print"
        aria-expanded={open}
      >
        {open ? <IconEyeOff className="w-4 h-4" /> : <IconFileText className="w-4 h-4" />}
        <span>{open ? 'Profil ausblenden' : 'Mein Coach-Profil ansehen'}</span>
      </button>

      {open && (
        <div className="mt-4 anim-fade-up">
          <div className="flex gap-2 mb-3 no-print">
            <button onClick={printAsPdf} className="btn btn-secondary text-xs px-3 py-1 inline-flex items-center gap-1.5">
              <IconDownload className="w-3.5 h-3.5" />
              <span>Als PDF speichern</span>
            </button>
            <button onClick={copy} className="btn btn-ghost text-xs px-3 py-1 inline-flex items-center gap-1.5">
              {copied ? <IconCheck className="w-3.5 h-3.5" /> : <IconCopy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Kopiert' : 'Markdown kopieren'}</span>
            </button>
            <button onClick={download} className="btn btn-ghost text-xs px-3 py-1 inline-flex items-center gap-1.5">
              <IconDownload className="w-3.5 h-3.5" />
              <span>Als .md herunterladen</span>
            </button>
          </div>
          <article className="print-profile border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] p-8 max-h-[70vh] overflow-y-auto">
            <header className="print-cover">
              <div className="print-logo">Deepling</div>
              <h1 className="print-title">Dein Coach-Profil</h1>
              <p className="print-subtitle">Persönliche Analyse · Version {profile.version}</p>
              <p className="print-date">{generatedDate}</p>
            </header>
            <div className="print-body">
              {renderMarkdown(profile.configMd)}
            </div>
            <footer className="print-footer">
              <span>Deepling · deepling.de</span>
              <span>Vertraulich — nur für dich</span>
            </footer>
          </article>
          <p className="mt-3 text-xs text-[var(--color-muted)] no-print">
            „Als PDF speichern" öffnet den Browser-Druckdialog. Im Mac-Dialog links unten
            auf <strong>PDF ▾</strong> → <strong>Als PDF sichern</strong>. Sektionen B14 +
            B15 (Tonprofil-Echo + Sprach-Mirror) sind die wichtigsten für deinen Coach.
          </p>
        </div>
      )}
    </div>
  )
}
