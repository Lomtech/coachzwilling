import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { id?: string; all?: boolean } | null
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  if (body.all) {
    const { error } = await supabase
      .from('coach_memory')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.id) {
    const { error } = await supabase
      .from('coach_memory')
      .update({ is_active: false })
      .eq('id', body.id)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'id or all required' }, { status: 400 })
}
