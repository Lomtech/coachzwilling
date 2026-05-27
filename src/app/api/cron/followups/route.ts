import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase/service'
import { loadCandidate, composeFollowup } from '@/lib/coach/followup'
import { sendEmail } from '@/lib/email/resend'
import { signToken, generateRandomTokenId } from '@/lib/email/tokens'
import { isAdminEmail } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const maxDuration = 300 // Vercel Pro: bis 800s, 300s deckt locker 500+ User

/**
 * Vercel Cron — täglich 07:00 UTC (= 08:00 Berlin Winter, 09:00 Sommer).
 * Schedule: in vercel.json
 *
 * Flow pro Run:
 * 1. Auth: Vercel sendet Authorization: Bearer ${CRON_SECRET}
 * 2. User-Selektion: opt-in + Letzter Chat 3-14 Tage her + Frequency-Cooldown OK + nicht unsubscribed
 * 3. Pro User: Daten laden → Haiku komponiert → DB-Insert (mit signed Token) → Resend sendet
 * 4. Rate-Limit-aware: bei 429 von Resend Pause + retry (oder skip + nächste Cron-Run)
 *
 * Idempotent: User wird nach erfolgreichem Send geupdatet (last_followup_at),
 * damit nicht zweimal pro Cycle gesendet wird.
 */
export async function GET(req: NextRequest) {
  // Auth: Vercel-Cron (Bearer CRON_SECRET) ODER eingeloggter Admin
  // (für manuelles Triggern aus dem Admin-Dashboard / via Browser)
  const auth = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null
  const isCronAuthed = expected ? auth === expected : true

  let isAdminAuthed = false
  if (!isCronAuthed) {
    try {
      const sb = await createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (user?.email && isAdminEmail(user.email)) isAdminAuthed = true
    } catch {/* ignore — bleibt unauthed */}
  }

  if (!isCronAuthed && !isAdminAuthed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const runId = crypto.randomUUID()
  const startedAt = Date.now()
  const supa = serviceClient()

  // Base-URL für CTA-Links (z. B. https://coachzwilling.com)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://fuehrungs-coach.vercel.app'

  // Selektion: alle opted-in Kandidaten holen + zusätzlich aktive
  // Coach-Profile checken. Wir nutzen NICHT mehr nur den state-Filter
  // weil der bei out-of-sync State-Drift User aussperrt obwohl sie eigentlich
  // ein aktives Profil + Memory haben (bekanntes Issue, Bug-Report 2026-05-27:
  // lomaliimadaev war state="questionnaire" trotz 90 Messages).
  const [{ data: candidates, error: selErr }, { data: activeProfiles }] = await Promise.all([
    supa
      .from('profiles')
      .select('id, full_name, email, followup_enabled, followup_frequency_days, last_followup_at, followup_unsubscribed_at, onboarding_state')
      .eq('followup_enabled', true)
      .is('followup_unsubscribed_at', null)
      .limit(500),
    supa
      .from('coach_profiles')
      .select('user_id')
      .eq('is_active', true),
  ])
  // Eligibilität: state passt ODER aktives Profil existiert (Belt-and-Suspenders)
  const usersWithActiveProfile = new Set((activeProfiles ?? []).map(p => p.user_id))
  const candidatesFiltered = (candidates ?? []).filter(p =>
    p.onboarding_state === 'profiled' ||
    p.onboarding_state === 'active' ||
    usersWithActiveProfile.has(p.id),
  )

  if (selErr) {
    console.error('[cron/followups] selection failed', selErr)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  const now = Date.now()
  const eligible = candidatesFiltered.filter(p => {
    if (!p.email) return false
    if (!p.last_followup_at) return true // noch nie gesendet → eligible
    const ageMs = now - new Date(p.last_followup_at).getTime()
    const cooldownMs = (p.followup_frequency_days ?? 4) * 24 * 60 * 60 * 1000
    return ageMs >= cooldownMs
  })

  console.log(
    `[cron/followups] run=${runId} total=${candidates?.length ?? 0} withProfile=${candidatesFiltered.length} eligible=${eligible.length}`,
  )

  const results = {
    runId,
    total: candidates?.length ?? 0,
    eligible: eligible.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    durationMs: 0,
    details: [] as Array<{
      userId: string
      status: 'sent' | 'skipped' | 'failed'
      reason?: string
      followupId?: string
      resendMessageId?: string
    }>,
  }

  for (const p of eligible) {
    try {
      const candidate = await loadCandidate(p.id)
      if (!candidate) {
        results.skipped++
        results.details.push({ userId: p.id, status: 'skipped', reason: 'no profile/email' })
        continue
      }

      // Nur senden wenn der User wirklich Material hat (mind. 1 Commitment ODER 3 Memories)
      const hasMaterial = candidate.commitments.length > 0 || candidate.memories.length >= 3
      if (!hasMaterial) {
        results.skipped++
        results.details.push({ userId: p.id, status: 'skipped', reason: 'no material yet' })
        continue
      }

      // Followup-Row VOR dem Senden anlegen → wir haben dann die ID + Tokens für CTA
      const followupId = crypto.randomUUID()
      const randomToken = generateRandomTokenId()
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 Tage

      const clickToken = signToken({
        userId: p.id,
        followupId,
        purpose: 'click',
      })
      const unsubscribeToken = signToken({
        userId: p.id,
        followupId,
        purpose: 'unsubscribe',
      })
      const ctaUrl = `${baseUrl}/api/followups/click/${clickToken}`
      const unsubscribeUrl = `${baseUrl}/api/followups/unsubscribe/${unsubscribeToken}`

      // Haiku komponiert
      const composed = await composeFollowup({ candidate, ctaUrl })
      if (!composed) {
        results.failed++
        results.details.push({ userId: p.id, status: 'failed', reason: 'compose failed' })
        continue
      }

      // DB-Row (vor Send, damit der Token gültig ist falls User in der Mail klickt)
      const { error: insErr } = await supa.from('email_followups').insert({
        id: followupId,
        user_id: p.id,
        subject: composed.subject,
        body_text: composed.bodyText,
        body_html: composed.bodyHtml,
        source_summary: composed.sourceSummary,
        run_id: runId,
        signed_token: randomToken,
        expires_at: expiresAt.toISOString(),
      })
      if (insErr) {
        console.error('[cron/followups] followup insert fail', insErr)
        results.failed++
        results.details.push({ userId: p.id, status: 'failed', reason: insErr.message })
        continue
      }

      // Senden
      const send = await sendEmail({
        to: candidate.email,
        subject: composed.subject,
        bodyHtml: composed.bodyHtml,
        bodyText: composed.bodyText,
        unsubscribeUrl,
        idempotencyKey: followupId,
      })

      if (!send.ok) {
        if (send.statusCode === 429 && send.retryAfterSec) {
          // Rate-Limit getroffen → diesen User für nächste Run aufheben (nicht updaten)
          console.warn(`[cron/followups] rate-limited, breaking loop. retryAfter=${send.retryAfterSec}s`)
          results.failed++
          results.details.push({ userId: p.id, status: 'failed', reason: `rate-limited (retry in ${send.retryAfterSec}s)` })
          // Insert wieder löschen damit's nächste Run wiederholbar ist
          await supa.from('email_followups').delete().eq('id', followupId)
          break
        }
        results.failed++
        results.details.push({ userId: p.id, status: 'failed', reason: send.error ?? 'unknown' })
        await supa.from('email_followups').delete().eq('id', followupId)
        continue
      }

      // Erfolg → sent_at + resend_message_id + last_followup_at updaten
      await supa
        .from('email_followups')
        .update({
          sent_at: new Date().toISOString(),
          resend_message_id: send.resendMessageId ?? null,
        })
        .eq('id', followupId)

      await supa
        .from('profiles')
        .update({ last_followup_at: new Date().toISOString() })
        .eq('id', p.id)

      results.sent++
      results.details.push({
        userId: p.id,
        status: 'sent',
        followupId,
        resendMessageId: send.resendMessageId,
      })
    } catch (e) {
      console.error(`[cron/followups] user ${p.id} failed`, e)
      results.failed++
      results.details.push({
        userId: p.id,
        status: 'failed',
        reason: e instanceof Error ? e.message : 'unknown',
      })
    }
  }

  results.durationMs = Date.now() - startedAt
  console.log(`[cron/followups] run=${runId} done sent=${results.sent} failed=${results.failed} skipped=${results.skipped} (${results.durationMs}ms)`)

  return NextResponse.json(results)
}
