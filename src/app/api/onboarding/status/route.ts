import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────────────────────
// Polling-Fallback für /api/onboarding/finalize.
//
// Wenn der SSE-Stream während der ~2-4 Min Opus-Generierung wegen Netz /
// Browser-Tab-Wechsel / Mobile-Background-Throttling abreisst, kann der Client
// hier den finalen Zustand abfragen. Die Profiler-Persistenz im finalize-
// Endpoint läuft unabhängig von der Stream-Verbindung zu Ende.
//
// Antwort-Shape — bewusst minimal:
//   { state: 'pending' | 'questionnaire' | 'processing' | 'profiled' | 'failed' }
//
// Client-Logik:
//   • 'processing'   → weiter pollen (alle 3-5s)
//   • 'profiled'     → router.push('/coach')
//   • 'failed'       → Retry-Button anbieten
//   • alles andere   → User war nicht im Onboarding (Sanity-Fall)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('onboarding_state')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    state: profile?.onboarding_state ?? 'pending',
  })
}
