import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface Body {
  enabled?: boolean
  frequencyDays?: number
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const update: {
    followup_enabled?: boolean
    followup_unsubscribed_at?: string | null
    followup_frequency_days?: number
  } = {}
  if (typeof body.enabled === 'boolean') {
    update.followup_enabled = body.enabled
    // Wenn jemand wieder aktiviert nachdem er unsubscribed war → clear timestamp
    if (body.enabled) {
      update.followup_unsubscribed_at = null
    }
  }
  if (typeof body.frequencyDays === 'number') {
    if (body.frequencyDays < 1 || body.frequencyDays > 30) {
      return NextResponse.json({ error: 'frequencyDays must be 1-30' }, { status: 400 })
    }
    update.followup_frequency_days = Math.round(body.frequencyDays)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
