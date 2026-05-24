import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface Body {
  decision: string
  context?: string
  allowPublish?: boolean
  displayName?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || typeof body.decision !== 'string' || body.decision.trim().length < 10) {
    return NextResponse.json({ error: 'Bitte beschreibe deine Entscheidung in mindestens 10 Zeichen.' }, { status: 400 })
  }

  const { error } = await supabase.from('testimonials').insert({
    user_id: user.id,
    decision: body.decision.trim(),
    context: body.context?.trim() || null,
    allow_publish: !!body.allowPublish,
    display_name: body.displayName?.trim() || null,
  })

  if (error) {
    console.error('[testimonials] insert failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
