import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatView } from '@/components/chat/ChatView'
import { isAdminEmail } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/coach')

  const { c: convId } = await searchParams

  // Letzte Conversations + Trial-Status (für Hint im Header)
  const [{ data: conversations }, { data: profile }, { data: sub }] = await Promise.all([
    supabase.from('conversations').select('id, title, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('trial_until').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
  ])

  const subActive = sub?.status === 'active' || sub?.status === 'trialing'
  const trialMs = profile?.trial_until ? new Date(profile.trial_until).getTime() - Date.now() : 0
  const trialDaysLeft = Math.max(0, Math.ceil(trialMs / 86_400_000))
  // Trial-Hint nur wenn Billing aktiv ist
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
  const showTrialHint = billingEnabled && !subActive && trialDaysLeft > 0 && trialDaysLeft <= 7
  const isAdmin = isAdminEmail(user.email)

  // Aktive Conversation (oder leer)
  let activeId: string | null = null
  let initialMessages: { id: string; role: 'user' | 'assistant'; content: string }[] = []

  if (convId) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', convId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (conv) {
      activeId = conv.id
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, role, content')
        .eq('conversation_id', conv.id)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true })
      initialMessages = (msgs ?? []).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    }
  }

  return (
    <div className="flex h-dvh">
      {/* Sidebar — auf Mobile als off-canvas, hier desktop-only */}
      <aside className="hidden md:flex flex-col w-72 border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="px-4 py-4 border-b border-[var(--color-border)]">
          <Link href="/" className="font-semibold text-lg tracking-tight">
            Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling
          </Link>
        </div>
        <div className="px-3 py-3">
          <Link
            href="/coach"
            className="btn btn-secondary btn-block"
          >
            + Neues Gespräch
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {(conversations ?? []).map(c => {
            const active = c.id === activeId
            return (
              <Link
                key={c.id}
                href={`/coach?c=${c.id}`}
                className={
                  'block px-3 py-2.5 rounded-xl text-sm truncate ' +
                  (active
                    ? 'bg-[var(--color-ink)] text-white'
                    : 'hover:bg-white text-[var(--color-ink-2)]')
                }
              >
                {c.title ?? 'Gespräch'}
              </Link>
            )
          })}
        </div>
        <div className="px-3 py-3 border-t border-[var(--color-border)] space-y-2">
          {showTrialHint && (
            <Link
              href="/billing"
              className="block text-xs text-center px-2 py-1.5 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium hover:opacity-80"
            >
              🎁 Noch {trialDaysLeft} {trialDaysLeft === 1 ? 'Tag' : 'Tage'} gratis
            </Link>
          )}
          {isAdmin && (
            <div className="grid grid-cols-2 gap-1.5">
              <Link
                href="/admin"
                className="block text-xs text-center px-2 py-1.5 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)] font-medium hover:bg-[var(--color-warning)]/15"
              >
                🔧 Admin
              </Link>
              <Link
                href="/admin/compare"
                className="block text-xs text-center px-2 py-1.5 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)] font-medium hover:bg-[var(--color-warning)]/15"
              >
                ⇆ Compare
              </Link>
            </div>
          )}
          <Link href="/settings" className="btn btn-ghost btn-block">Konto</Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <Link href="/" className="font-semibold tracking-tight">
            Coaching<span className="text-[var(--color-accent)]">·</span>Zwilling
          </Link>
          <div className="flex gap-2">
            {isAdmin && (
              <Link href="/admin" className="btn btn-ghost px-3 py-1 text-sm text-[var(--color-warning)]">Admin</Link>
            )}
            <Link href="/coach" className="btn btn-ghost px-3 py-1 text-sm">+ Neu</Link>
            <Link href="/settings" className="btn btn-ghost px-3 py-1 text-sm">Konto</Link>
          </div>
        </header>

        {/* key forciert Re-Mount bei Conversation-Wechsel — Chat-Verlauf wird so frisch geladen */}
        <ChatView
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  )
}
