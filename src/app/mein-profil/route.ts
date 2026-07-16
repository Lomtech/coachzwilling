import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAndRenderDeepSpace } from '@/lib/coach/deepspace'

export const runtime = 'nodejs'
// LLM-Transform beim ersten Aufruf; danach aus dem Cache.
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * /mein-profil — das EIGENE Kurz-Profil im Deep-Space-Design.
 *
 * Jeder Nutzer bekommt den Link nach dem Fragebogen automatisch per Mail
 * (sendUserProfileReady). Hier ansehen und per Cmd/Strg+P als PDF sichern.
 *
 * Bewusst die 'mini'-Variante: Das VOLLE Rohprofil bleibt hinter Bezahlung.
 * Der Paywall-CTA zeigt deshalb auf /billing — nicht aufs Onboarding, das
 * dieser Nutzer ja bereits gemacht hat.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/mein-profil')

  // Eigenes aktives Profil über den User-Client (RLS) — niemand kann hier ein
  // fremdes Profil ziehen.
  const { data: cp } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cp?.id) {
    return new NextResponse(
      'Noch kein Profil vorhanden — fülle zuerst den Fragebogen aus: /onboarding',
      { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de'
  const result = await loadAndRenderDeepSpace(cp.id, 'mini', { ctaUrl: `${appUrl}/billing` })
  if ('error' in result) {
    return new NextResponse(result.error, { status: result.status })
  }
  return new NextResponse(result.html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
