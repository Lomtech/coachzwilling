import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatView } from '@/components/chat/ChatView'
import { ConversationItem } from '@/components/chat/ConversationItem'
import { isAdminEmail } from '@/lib/admin-auth'
import { AccountMenu } from '@/components/AccountMenu'

export const dynamic = 'force-dynamic'

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; followup?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/coach')

  const { c: convId, followup: followupId } = await searchParams

  // Follow-up-Email-Klick: User kommt aus seiner Mail. Wir erstellen eine
  // neue Conversation in der die Email-Frage als erster Coach-Turn vorgefüllt
  // ist, damit der User direkt antworten kann. Dann redirect zur frischen Conv.
  if (followupId && !convId) {
    const { data: fu } = await supabase
      .from('email_followups')
      .select('subject, body_text')
      .eq('id', followupId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (fu) {
      // Coach-Turn-Text: Subject + Body ohne den CTA-Link am Ende
      const cleanBody = fu.body_text.replace(/Schreib hier rein:.*$/s, '').trim()
      const coachText = `${fu.subject}\n\n${cleanBody}`
      // Neue Conv anlegen + Coach-Message persistieren
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title: fu.subject.slice(0, 60) })
        .select('id')
        .single()
      if (newConv) {
        await supabase.from('messages').insert({
          conversation_id: newConv.id,
          user_id: user.id,
          role: 'assistant',
          content: coachText,
        })
        redirect(`/coach?c=${newConv.id}`)
      }
    }
  }

  // Letzte Conversations + Trial-Status + User-Profil (für Avatar)
  const [{ data: conversations }, { data: profile }, { data: sub }] = await Promise.all([
    supabase.from('conversations').select('id, title, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('trial_until, full_name').eq('id', user.id).maybeSingle(),
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
  let initialMessages: { id: string; role: 'user' | 'assistant'; content: string; rating?: 1 | -1 | null }[] = []

  if (convId) {
    // Ownership-Check + Messages in einem Schwung parallel laden.
    // Vorher waren das 2 serielle Queries (conv → msgs) + 1 weiterer
    // serieller Query für Feedback → bis zu 3× Round-Trip pro Switch.
    const [{ data: conv }, { data: msgs }] = await Promise.all([
      supabase
        .from('conversations')
        .select('id')
        .eq('id', convId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('messages')
        .select('id, role, content')
        .eq('conversation_id', convId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true }),
    ])

    if (conv) {
      activeId = conv.id

      // Feedback parallel zu evtl. weiteren Abfragen
      const assistantIds = (msgs ?? [])
        .filter(m => m.role === 'assistant')
        .map(m => m.id)
      let ratings = new Map<string, 1 | -1>()
      if (assistantIds.length > 0) {
        const { data: fbs } = await supabase
          .from('message_feedback')
          .select('message_id, rating')
          .in('message_id', assistantIds)
          .eq('user_id', user.id)
        ratings = new Map(
          (fbs ?? []).map(f => [f.message_id, (f.rating === 1 ? 1 : -1) as 1 | -1])
        )
      }

      initialMessages = (msgs ?? []).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        rating: m.role === 'assistant' ? (ratings.get(m.id) ?? null) : null,
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
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {(conversations ?? []).map(c => (
            <ConversationItem
              key={c.id}
              id={c.id}
              title={c.title}
              active={c.id === activeId}
            />
          ))}
          {(!conversations || conversations.length === 0) && (
            <div className="px-3 py-2.5 text-xs text-[var(--color-muted)]">
              Noch keine Gespräche.
            </div>
          )}
        </div>
        <div className="px-2 py-2 border-t border-[var(--color-border)]">
          <AccountMenu
            email={user.email ?? ''}
            fullName={profile?.full_name ?? null}
            isAdmin={isAdmin}
            showTrialPill={showTrialHint}
            trialDaysLeft={trialDaysLeft}
          />
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
