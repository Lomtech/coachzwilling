import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

// POST /api/org/create — { name, slug?, industry?, k_anonymity_threshold? }
//
// Jeder eingeloggte User darf eine Org gründen und wird automatisch Owner.
// Wenn slug fehlt, wird einer aus dem Namen generiert (mit dedupe-suffix
// bei Kollisionen).
//
// Antwort: { ok: true, org: { id, slug, name } } oder { error }.

interface CreateBody {
  name?: string
  slug?: string
  industry?: string | null
  k_anonymity_threshold?: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as CreateBody | null
  const name = (body?.name ?? '').trim()
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'Name muss 2–80 Zeichen haben' }, { status: 400 })
  }

  const k = clampK(body?.k_anonymity_threshold)

  const supa = serviceClient()

  // Slug: aus Name normalisieren, bei Kollision dedupe -2, -3, …
  const base = (body?.slug ?? name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  if (base.length < 2) {
    return NextResponse.json({ error: 'Slug ungültig' }, { status: 400 })
  }

  let slug = base
  for (let i = 0; i < 10; i++) {
    const { data: clash } = await supa
      .from('organizations').select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${i + 2}`
  }

  const { data: org, error } = await supa
    .from('organizations')
    .insert({
      name,
      slug,
      industry: body?.industry ?? null,
      k_anonymity_threshold: k,
    })
    .select('id, slug, name')
    .single()
  if (error || !org) {
    return NextResponse.json({ error: error?.message ?? 'create failed' }, { status: 500 })
  }

  // Caller wird Owner
  const { error: memErr } = await supa
    .from('organization_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
  if (memErr) {
    // Rollback: org wieder weg, sonst Karteileiche
    await supa.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, org })
}

function clampK(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 5
  return Math.max(3, Math.min(50, Math.round(v)))
}
