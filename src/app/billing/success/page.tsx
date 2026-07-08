import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { syncSubscriptionFromStripe } from '@/lib/stripe/sync'

export const dynamic = 'force-dynamic'

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  if (params.session_id) {
    try {
      const session = await stripe().checkout.sessions.retrieve(params.session_id)
      // Ownership-Check gegen IDOR: nur die EIGENE Checkout-Session syncen.
      // Ohne diesen Guard könnte eine fremde session_id ein fremdes Abo auf den
      // eingeloggten User buchen → Gratis-Zugang. Jede legitime Session trägt
      // metadata.user_id (in /api/stripe/checkout gesetzt); der autoritative
      // Sync läuft ohnehin über den signierten checkout.session.completed-Webhook.
      if (
        session.metadata?.user_id === user.id &&
        session.subscription &&
        typeof session.subscription === 'string'
      ) {
        await syncSubscriptionFromStripe(session.subscription, user.id)
      }
    } catch (e) {
      console.error('[billing-success] sync', e)
    }
  }

  return (
    <main className="min-h-dvh px-5 py-12 max-w-md w-full mx-auto text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-2xl font-semibold tracking-tight mb-3">Du bist drin.</h1>
      <p className="text-[var(--color-ink-2)] mb-8">
        Deine Probezeit läuft. Lass uns starten — dein Coach wartet.
      </p>
      <Link href="/coach" className="btn btn-primary btn-block">Zum Coach</Link>
    </main>
  )
}
