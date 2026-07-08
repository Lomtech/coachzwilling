import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { loadAndRenderDeepSpace } from '@/lib/coach/deepspace'

export const runtime = 'nodejs'
// LLM-Transform kann bei großem Profil einige Sekunden brauchen.
export const maxDuration = 120

/**
 * Rendert das Deep-Space-Kundendokument eines Profils (Admin-only).
 * Lom/Michael öffnen den Link, speichern per Cmd/Strg+P als PDF und senden es.
 *
 *   ?variant=mini|full   (default mini)
 *   ?refresh=1           Cache umgehen und neu generieren
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin()
  const { id } = await params
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') === 'full' ? 'full' : 'mini'
  const refresh = url.searchParams.get('refresh') === '1'

  const result = await loadAndRenderDeepSpace(id, variant, { refresh })
  if ('error' in result) {
    return new NextResponse(result.error, { status: result.status })
  }
  return new NextResponse(result.html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
