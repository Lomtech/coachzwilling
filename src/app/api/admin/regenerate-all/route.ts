import { NextResponse, type NextRequest } from 'next/server'
import { serviceClient } from '@/lib/supabase/service'
import { generateCoachProfile } from '@/lib/coach/profiler'
import { TOTAL_QUESTIONS, QUESTIONS } from '@/data/questionnaire'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel Hobby cap

/**
 * One-shot: regeneriert ALLE aktiven Coach-Profile mit dem aktuell
 * konfigurierten Modell (CLAUDE_PROFILER_MODEL). Sequentiell weil Langdock
 * 500 RPM pro Workspace tolerant ist, aber 8192 max_tokens × 10 User
 * parallel würde TPM-Limit reissen.
 *
 * Auth: Secret-Query-Param. Wird nach Run entfernt.
 *   GET /api/admin/regenerate-all?s=<SECRET>
 *   GET /api/admin/regenerate-all?s=<SECRET>&modelHint=claude-sonnet-4-6
 *     → skip User, deren aktives Profil bereits dieses Modell hat. Damit
 *       kann der Endpoint mehrfach gegen das 300s-Hobby-Timeout-Limit
 *       laufen, ohne fertige User doppelt zu generieren.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('s')
  const expected = process.env.ADMIN_REGEN_SECRET
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const modelHint = url.searchParams.get('modelHint')
  const supa = serviceClient()

  // Alle User mit aktivem Profil holen (deduped per user_id, optional gefiltert)
  const { data: rows, error: selErr } = await supa
    .from('coach_profiles')
    .select('user_id, model')
    .eq('is_active', true)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

  const filtered = (rows ?? []).filter(r => {
    if (!modelHint) return true
    // Skip wenn aktives Profil bereits dieses Modell hat
    return !r.model?.startsWith(modelHint)
  })
  const userIds = Array.from(new Set(filtered.map(r => r.user_id))) as string[]
  const startedAt = Date.now()

  const results: Array<{
    userId: string
    ok: boolean
    model?: string
    error?: string
    skipReason?: string
  }> = []

  for (const userId of userIds) {
    // Hard-Timeout: bei 270s aufhören, restliche User landen im "remaining"
    if (Date.now() - startedAt > 270_000) {
      return NextResponse.json({
        total: userIds.length,
        ok: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok && !r.skipReason).length,
        skipped: results.filter(r => r.skipReason).length,
        remainingUserIds: userIds.slice(results.length),
        results,
        note: '270s-Timeout, retry mit &modelHint=claude-sonnet-4-6 für Rest.',
      })
    }
    try {
      // Letzte completed Antwort des Users
      const { data: response, error: rErr } = await supa
        .from('questionnaire_responses')
        .select('id, answers, completed_at')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (rErr) {
        results.push({ userId, ok: false, error: rErr.message })
        continue
      }
      if (!response) {
        results.push({ userId, ok: false, skipReason: 'no-completed-response' })
        continue
      }

      const answers = (response.answers ?? {}) as Record<string, string>
      const answered = QUESTIONS.filter(q => Boolean(answers[String(q.id)])).length
      // V4-Toleranz: 42 Antworten reichen für V5-Profil. Sektionen B9/B10
      // entstehen dünner aus dem vorhandenen Material — besser als
      // Modell-Sprung-Outage. Vollständige V5-Profile gibt's für Neu-Onboarder.
      const MIN_ANSWERS = 42
      if (answered < MIN_ANSWERS) {
        results.push({ userId, ok: false, skipReason: `incomplete-${answered}/${TOTAL_QUESTIONS}` })
        continue
      }

      const result = await generateCoachProfile(answers)

      await supa
        .from('coach_profiles')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true)

      const { data: inserted, error: insErr } = await supa
        .from('coach_profiles')
        .insert({
          user_id: userId,
          source_response_id: response.id,
          config_md: result.configMd,
          tone_oneliner: result.toneOneliner,
          language_mirror: result.languageMirror,
          model: result.model,
          is_active: true,
        })
        .select('id, model')
        .single()
      if (insErr || !inserted) {
        results.push({ userId, ok: false, error: insErr?.message ?? 'insert failed' })
        continue
      }
      results.push({ userId, ok: true, model: inserted.model })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ userId, ok: false, error: msg })
    }
  }

  return NextResponse.json({
    total: userIds.length,
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok && !r.skipReason).length,
    skipped: results.filter(r => r.skipReason).length,
    results,
  })
}
