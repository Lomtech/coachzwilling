import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

/**
 * Löscht eine Conversation des Users.
 * Kaskade:
 * - messages werden mitgelöscht (FK ON DELETE CASCADE)
 * - message_feedback wird mit messages gelöscht (FK ON DELETE CASCADE)
 * - coach_memory bleibt erhalten, conversation_id wird auf NULL gesetzt
 *   (Insights über den User sind Conv-übergreifend wertvoll)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id || id.length < 8) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Ownership-Check über User-RLS-Client (statt service)
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!conv) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Löschen via service-client damit RLS auf Cascade-Subtabellen nicht zickt
  const supa = serviceClient()
  const { error } = await supa
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[conversations/delete] failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Conversation umbenennen — kleines Bonus-Feature für den selben Endpoint.
 * UI macht aktuell nichts damit, aber API ist konsistent.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { title?: string } | null
  const title = body?.title?.trim()
  if (!title || title.length < 1 || title.length > 120) {
    return NextResponse.json({ error: 'title 1-120 chars required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
