/**
 * Loading-Skeleton für /coach.
 * Wird AUTOMATISCH von Next.js angezeigt während die Server-Component
 * page.tsx noch Daten lädt — z. B. bei Sidebar-Switch zwischen Conversations.
 *
 * Bewusst kein Spinner: matched die echte Chat-Layout-Struktur damit der
 * Wechsel optisch instant wirkt, auch wenn die Daten 100-300ms brauchen.
 */
export default function CoachLoading() {
  return (
    <div className="flex h-dvh">
      {/* Sidebar-Skeleton (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <div className="h-6 w-40 rounded bg-[var(--color-border)]/60 animate-pulse" />
        </div>
        <div className="px-3 py-3">
          <div className="h-10 rounded-xl bg-[var(--color-border)]/40 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 mx-1 rounded-xl bg-[var(--color-border)]/30 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
        <div className="px-2 py-2 border-t border-[var(--color-border)]">
          <div className="h-10 rounded-xl bg-[var(--color-border)]/40 animate-pulse" />
        </div>
      </aside>

      {/* Main column skeleton */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header skeleton */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="h-5 w-32 rounded bg-[var(--color-border)]/50 animate-pulse" />
          <div className="h-7 w-16 rounded-full bg-[var(--color-border)]/40 animate-pulse" />
        </header>

        {/* Chat-Bubble-Skeletons (drei Stück, abwechselnd user/assistant) */}
        <div className="flex-1 overflow-hidden px-4 py-6 max-w-2xl w-full mx-auto space-y-4">
          <div className="flex justify-start">
            <div className="h-16 w-3/4 rounded-2xl bg-[var(--color-border)]/30 animate-pulse" />
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-1/2 rounded-2xl bg-[var(--color-border)]/50 animate-pulse" style={{ animationDelay: '120ms' }} />
          </div>
          <div className="flex justify-start">
            <div className="h-24 w-4/5 rounded-2xl bg-[var(--color-border)]/30 animate-pulse" style={{ animationDelay: '240ms' }} />
          </div>
        </div>

        {/* Composer-Skeleton */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="max-w-2xl mx-auto px-3 pt-3 pb-3 flex items-end gap-2">
            <div className="h-12 flex-1 rounded-2xl bg-[var(--color-border)]/30 animate-pulse" />
            <div className="h-12 w-12 rounded-full bg-[var(--color-border)]/40 animate-pulse" />
            <div className="h-12 w-12 rounded-full bg-[var(--color-border)]/60 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
