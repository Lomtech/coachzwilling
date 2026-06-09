import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// proxy.ts (Next 16 — Nachfolger von middleware.ts)
//
// Aufgaben:
//  1. Supabase-Session refreshen (Cookie-Sync für Server-Komponenten)
//  2. CSRF-Schutz für state-mutating API-Routen
//  3. Auth-Gate: /coach, /onboarding, /settings, /billing → nur eingeloggt
//  4. Coach-Gate: /coach → braucht aktive Subscription + abgeschlossenes Profil
// ─────────────────────────────────────────────────────────────────────────────

// /billing ist absichtlich PUBLIC (Preise sichtbar ohne Login) —
// Checkout selbst (POST /api/stripe/checkout) bleibt auth-protected.
const PROTECTED_PREFIXES = ['/coach', '/onboarding', '/settings', '/org']
const COACH_PREFIX = '/coach'
const AUTH_REDIRECT_PATHS = ['/login', '/signup']

const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_WHITELIST_PREFIXES = ['/api/stripe/webhook']

export async function proxy(request: NextRequest) {
  // 1) CSRF
  const csrfBlock = checkCsrf(request)
  if (csrfBlock) return csrfBlock

  // 2) Supabase-Session refresh
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // 3) Wenn eingeloggt → Auth-Pages umleiten
  if (user && AUTH_REDIRECT_PATHS.includes(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/coach'
    return NextResponse.redirect(url)
  }

  const isProtected = PROTECTED_PREFIXES.some(p => path.startsWith(p))
  if (!isProtected) return response

  // 4) Auth-Gate
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  // 5) Coach-Gate: Profil + (Trial ODER Subscription)
  if (path.startsWith(COACH_PREFIX)) {
    // Defensive Onboarding-Check: schau auf REAL-Daten (aktives coach_profile),
    // nicht nur auf den onboarding_state-Flag. Sonst hängen User die in der
    // DB-State-Update verloren haben permanent im Onboarding fest, auch wenn
    // sie längst ein Profil + Chat-Historie haben. (Bug-Report dreadflicker
    // 2026-05-25: State war "questionnaire" trotz 90 Messages + Profile.)
    const [{ data: profile }, { data: sub }, { data: activeCoachProfile }] = await Promise.all([
      supabase.from('profiles').select('onboarding_state, trial_until').eq('id', user.id).maybeSingle(),
      supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('coach_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    ])

    const stateSaysProfiled = profile?.onboarding_state === 'profiled' || profile?.onboarding_state === 'active'
    const hasActiveCoachProfile = !!activeCoachProfile
    // Onboarding gilt als erledigt wenn ENTWEDER der State passt ODER ein
    // aktives Coach-Profil existiert. So heilt sich der Coach-Zugang selbst
    // wenn der State-Flag aus irgendeinem Grund nicht mit der Realität synct.
    const onboardingDone = stateSaysProfiled || hasActiveCoachProfile
    if (!onboardingDone) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    // Wenn Billing global deaktiviert ist → kein Sub/Trial-Check, freie Nutzung
    const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

    if (billingEnabled) {
      // Zugang erlaubt wenn: aktive Sub ODER Trial läuft ODER DEMO_USER
      const subActive = sub?.status === 'active' || sub?.status === 'trialing'
      const trialActive = !!profile?.trial_until && new Date(profile.trial_until) > new Date()
      const demoAllowed =
        process.env.DEMO_MODE === 'true' &&
        typeof user.email === 'string' &&
        (process.env.DEMO_USER_EMAILS ?? '')
          .split(',')
          .map(s => s.trim().toLowerCase())
          .includes(user.email.toLowerCase())

      if (!subActive && !trialActive && !demoAllowed) {
        const url = request.nextUrl.clone()
        url.pathname = '/billing'
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// ─── CSRF-Helper ────────────────────────────────────────────────────────────
function checkCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase()
  if (!CSRF_METHODS.has(method)) return null
  const path = request.nextUrl.pathname
  if (!path.startsWith('/api/')) return null
  if (CSRF_WHITELIST_PREFIXES.some(p => path.startsWith(p))) return null

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const allowed = buildAllowed()

  if (origin) {
    if (!allowed.has(origin)) {
      return new NextResponse('Forbidden — bad origin', { status: 403 })
    }
    return null
  }
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      if (!allowed.has(refOrigin)) {
        return new NextResponse('Forbidden — bad referer', { status: 403 })
      }
      return null
    } catch {
      return new NextResponse('Forbidden — invalid referer', { status: 403 })
    }
  }
  return new NextResponse('Forbidden — missing origin', { status: 403 })
}

function buildAllowed(): Set<string> {
  const set = new Set<string>(['http://localhost:3000', 'http://localhost:3001'])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try { set.add(new URL(appUrl).origin) } catch {}
  }
  return set
}
