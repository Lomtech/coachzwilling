import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface Body {
  messageId: string
  rating: 1 | -1
  comment?: string | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || typeof body.messageId !== 'string' || (body.rating !== 1 && body.rating !== -1)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  // Ownership-Check: User darf nur Feedback zu Messages aus seinen eigenen
  // Conversations geben.
  const { data: msg } = await supabase
    .from('messages')
    .select('id, role, user_id')
    .eq('id', body.messageId)
    .maybeSingle()
  if (!msg || msg.user_id !== user.id) {
    return NextResponse.json({ error: 'message not found' }, { status: 404 })
  }
  if (msg.role !== 'assistant') {
    return NextResponse.json({ error: 'can only rate coach replies' }, { status: 400 })
  }

  // Upsert: pro (message, user) gibt's max 1 Eintrag (UNIQUE constraint)
  const { error } = await supabase
    .from('message_feedback')
    .upsert(
      {
        message_id: body.messageId,
        user_id: user.id,
        rating: body.rating,
        comment: body.comment?.trim() || null,
      },
      { onConflict: 'message_id,user_id' }
    )

  if (error) {
    console.error('[feedback] upsert failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const messageId = req.nextUrl.searchParams.get('messageId')
  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('message_feedback')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
