import { NextResponse, type NextRequest } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { buildDeepSpaceDoc } from '@/lib/coach/deepspace'
import { renderDeepSpaceHtml } from '@/lib/coach/deepspace-html'
import { miniScanAnswersToText } from '@/data/mini-scan'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Öffentliche Deep-Space-VORSCHAU eines Mini-Scan-Leads (Lead-Magnet).
 * Der Lead-Link ist eine nicht-erratbare UUID. Wir generieren das Mini-
 * Dokument on-demand aus den gespeicherten Scan-Antworten und rendern es
 * im Deep-Space-Design (mit 49-€-Paywall auf den Vollscan).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supa = serviceClient()
  const { data: lead } = await supa
    .from('leads')
    .select('answers, name, source')
    .eq('id', id)
    .maybeSingle()

  if (!lead?.answers || lead.source !== 'mini_scan') {
    return new NextResponse('Vorschau nicht gefunden', { status: 404 })
  }

  const scanText = miniScanAnswersToText(lead.answers as unknown as Record<string, string>)
  const name = (lead.name ?? '').trim().split(/\s+/)[0] || 'Du'

  const doc = await buildDeepSpaceDoc(scanText, { name, variant: 'mini', kind: 'scan' })
  const html = renderDeepSpaceHtml(doc, {
    variant: 'mini',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de',
    price: '49 €',
  })
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
