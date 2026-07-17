import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
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
  let oneTime = false
  if (params.session_id) {
    try {
      const session = await stripe().checkout.sessions.retrieve(params.session_id)
      // Ownership-Check gegen IDOR: nur die EIGENE Checkout-Session verarbeiten.
      // Jede legitime Session trägt metadata.user_id (in /api/stripe/checkout
      // gesetzt); der autoritative Sync läuft ohnehin über den signierten Webhook.
      if (session.metadata?.user_id === user.id) {
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          // 149-€-Einmalkauf → Teil 2 + Vollprofil freischalten. Fallback zum
          // Webhook (idempotent) — falls dieser verzögert oder nicht ankommt.
          await serviceClient()
            .from('profiles')
            .update({ full_unlocked: true, full_unlocked_at: new Date().toISOString() })
            .eq('id', user.id)
          oneTime = true
        } else if (session.subscription && typeof session.subscription === 'string') {
          await syncSubscriptionFromStripe(session.subscription, user.id)
        }
      }
    } catch (e) {
      console.error('[billing-success] sync', e)
    }
  }

  return (
    <main className="min-h-dvh px-5 py-12 max-w-md w-full mx-auto text-center">
      <div className="text-5xl mb-3">🎉</div>
      <h1 className="text-2xl font-semibold tracking-tight mb-3">
        {oneTime ? 'Freigeschaltet.' : 'Du bist drin.'}
      </h1>
      <p className="text-[var(--color-ink-2)] mb-8">
        {oneTime
          ? 'Dein Vollprofil ist freigeschaltet. Mach jetzt den zweiten Teil des Fragebogens — danach kalibriert sich dein Deepling vollständig.'
          : 'Deine Probezeit läuft. Lass uns starten — dein Coach wartet.'}
      </p>
      <Link href={oneTime ? '/onboarding' : '/coach'} className="btn btn-primary btn-block">
        {oneTime ? 'Weiter zu Teil 2 →' : 'Zum Coach'}
      </Link>
    </main>
  )
}
