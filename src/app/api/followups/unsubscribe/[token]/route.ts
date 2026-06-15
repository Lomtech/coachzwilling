import { type NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/email/tokens'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * RFC 8058 One-Click-Unsubscribe.
 *
 * Gmail/Outlook senden bei "Abbestellen"-Klick einen HTTP POST hierhin —
 * Body ist meist `List-Unsubscribe=One-Click`, aber wir parsen den Body nicht,
 * weil das Verifizieren des signed Tokens als Beweis reicht.
 *
 * Wir unterstützen ZUSÄTZLICH GET, damit User-Klick aus dem Email-Footer
 * (manuell) auch funktioniert.
 *
 * Effekt: profiles.followup_unsubscribed_at + followup_enabled=false.
 */

async function unsubscribe(token: string): Promise<{ ok: boolean; error?: string }> {
  const payload = verifyToken(token)
  if (!payload || payload.purpose !== 'unsubscribe') {
    return { ok: false, error: 'invalid or expired token' }
  }
  const supa = serviceClient()
  const { error } = await supa
    .from('profiles')
    .update({
      followup_enabled: false,
      followup_unsubscribed_at: new Date().toISOString(),
    })
    .eq('id', payload.userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const r = await unsubscribe(token)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const r = await unsubscribe(token)
  if (!r.ok) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:40px;text-align:center;"><h2>Abbestellen fehlgeschlagen</h2><p>${r.error}</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    )
  }
  return new NextResponse(
    `<html><body style="font-family:system-ui;padding:40px;text-align:center;"><h2>Abbestellt ✓</h2><p>Du bekommst keine Follow-up-Emails mehr vom Deepling. Du kannst das jederzeit in den Einstellungen wieder aktivieren.</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  )
}
