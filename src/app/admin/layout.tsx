import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import { requireAdmin } from '@/lib/admin-auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <header className="sticky top-0 z-30 bg-[var(--color-bg)]/85 backdrop-blur border-b border-[var(--color-border)]">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Link href="/admin" className="font-semibold tracking-tight flex items-center gap-2">
            <LogoMark size={24} />
            <span>Admin</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)]">intern</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Users</Link>
            <Link href="/admin/feedback" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Feedback</Link>
            <Link href="/admin/followups" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Follow-ups</Link>
            <Link href="/admin/leads" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Leads</Link>
            <Link href="/admin/codes" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Codes</Link>
            <Link href="/admin/testimonials" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Testimonials</Link>
            <Link href="/admin/compare" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">Compare</Link>
            <Link href="/coach" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)]">→ Coach</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}
