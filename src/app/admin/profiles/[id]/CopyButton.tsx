'use client'

import { useState } from 'react'

export function CopyButton({ md }: { md: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function download() {
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profil-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <button onClick={copy} className="btn btn-secondary text-xs px-3 py-1.5">
        {copied ? '✓ Kopiert' : 'Markdown kopieren'}
      </button>
      <button onClick={download} className="btn btn-secondary text-xs px-3 py-1.5">
        ↓ .md
      </button>
    </div>
  )
}
