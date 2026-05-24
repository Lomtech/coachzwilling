import { NextResponse, type NextRequest } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { generateMiniProfile } from '@/lib/coach/mini-profile'
import { MINI_SCAN_QUESTIONS, miniScanAnswersToText } from '@/data/mini-scan'

export const runtime = 'nodejs'
export const maxDuration = 30

interface Body {
  answers: Record<string, string>
  email?: string
  name?: string
  utm?: Record<string, string>
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || !body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  // Minimal-Validation: alle Fragen beantwortet?
  const missing = MINI_SCAN_QUESTIONS.filter(q => !body.answers[q.id]?.toString().trim())
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Es fehlen Antworten: ${missing.map(q => q.id).join(', ')}` },
      { status: 400 }
    )
  }

  // Email optional — wenn da, einfache Format-Validation
  const email = body.email?.toString().trim().toLowerCase() ?? null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Ungültige E-Mail-Adresse' }, { status: 400 })
  }

  // Kurzprofil via Haiku generieren
  const scanText = miniScanAnswersToText(body.answers)
  let shortProfile: string | null = null
  try {
    const result = await generateMiniProfile({ scanText })
    shortProfile = result.text
  } catch (e) {
    console.error('[mini-scan] profile generation failed', e)
    // Auch ohne Profil: Lead trotzdem speichern
  }

  // Lead in DB ablegen (nur wenn email — sonst nur Profil zurückgeben ohne Persistierung)
  if (email) {
    const supa = serviceClient()
    const userAgent = req.headers.get('user-agent') ?? null
    const { error: insErr } = await supa.from('leads').insert({
      email,
      name: body.name?.toString().trim() || null,
      source: 'mini_scan',
      answers: body.answers,
      short_profile: shortProfile,
      utm: body.utm ?? null,
      user_agent: userAgent,
    })
    if (insErr) {
      console.error('[mini-scan] lead insert failed', insErr)
      // Trotzdem das Profil zurückgeben — der Lead ist wichtig genug
    }
  }

  return NextResponse.json({
    ok: true,
    shortProfile,
    storedAsLead: !!email,
  })
}
