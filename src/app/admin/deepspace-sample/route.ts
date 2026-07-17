import { NextResponse, type NextRequest } from 'next/server'
import { renderDeepSpaceHtml, SAMPLE_DEEPSPACE_DOC } from '@/lib/coach/deepspace-html'
import { loadAndRenderDeepSpace } from '@/lib/coach/deepspace'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * DEV-Vorschau des Deep-Space-Renderers. Nur in Development erreichbar. In
 * Production: 404 (die echte, admin-geschützte Route ist
 * /admin/profiles/[id]/deepspace).
 *
 *   (ohne Parameter)   → Markus-Beispiel (reines Design)
 *   ?id=<profileId>    → echtes Profil live transformieren + rendern (Test)
 *   ?variant=mini|full ?refresh=1
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }
  const url = new URL(req.url)
  const variant = url.searchParams.get('variant') === 'full' ? 'full' : 'mini'
  const id = url.searchParams.get('id')

  if (id) {
    const result = await loadAndRenderDeepSpace(id, variant, {
      refresh: url.searchParams.get('refresh') === '1',
      appUrl: 'https://deepling.de',
    })
    if ('error' in result) return new NextResponse(result.error, { status: result.status })
    return new NextResponse(result.html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  const html = renderDeepSpaceHtml(SAMPLE_DEEPSPACE_DOC, {
    variant,
    appUrl: 'https://deepling.de',
    price: '149 €',
  })
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
