import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateProbeQuestion, PROBE_MIN_CHARS } from '@/lib/coach/probe'
import { questionById } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const maxDuration = 30

interface Body {
  questionId: number
  answer: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || typeof body.questionId !== 'number' || typeof body.answer !== 'string') {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const q = questionById(body.questionId)
  if (!q || q.type !== 'open') {
    return NextResponse.json({ error: 'question not open or not found' }, { status: 400 })
  }

  // Nur probes wenn Antwort wirklich kurz ist (Frontend sollte auch checken, aber server-side enforce)
  if (body.answer.trim().length >= PROBE_MIN_CHARS) {
    return NextResponse.json({ probe: null, reason: 'answer-long-enough' })
  }

  const probe = await generateProbeQuestion({
    question: q.prompt,
    answer: body.answer.trim(),
  })

  return NextResponse.json({ probe })
}
