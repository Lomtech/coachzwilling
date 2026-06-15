import Link from 'next/link'
import { LogoMark } from '@/components/Logo'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight flex items-center gap-2">
            <LogoMark size={22} />
            <span>Deepling</span>
          </Link>
          <Link href="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            Zur Startseite
          </Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
