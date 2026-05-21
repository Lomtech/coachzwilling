import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refineProfileForUser } from '@/lib/coach/refine'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const result = await refineProfileForUser({
    userId: user.id,
    source: 'manual_refresh',
  })

  if (!result) {
    return NextResponse.json(
      { error: 'Kein Profil zum Aktualisieren oder noch kein Coaching-Material. Führe zuerst ein paar Coach-Gespräche.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    version: result.version,
    memoriesUsed: result.memoriesUsed,
    conversationsUsed: result.conversationsUsed,
    messagesUsed: result.messagesUsed,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  })
}
