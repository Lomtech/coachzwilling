#!/usr/bin/env tsx
/**
 * Bulk-Regenerate: für ALLE User mit abgeschlossenem Onboarding ein
 * neues Coach-Profil generieren — nutzt PROFILER_PROMPT v3.1 (inkl. Schärfungs-Patch).
 *
 * Standalone — umgeht server-only Module durch direkten Anthropic-Call.
 *
 * Usage:
 *   npx tsx scripts/bulk-regenerate-profiles.ts
 *   npx tsx scripts/bulk-regenerate-profiles.ts --only=email@example.com
 *   npx tsx scripts/bulk-regenerate-profiles.ts --dry-run
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { PROFILER_PROMPT } from '../src/lib/coach/prompts'
import { QUESTIONS, TOTAL_QUESTIONS, answersToScanText } from '../src/data/questionnaire'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.CLAUDE_PROFILER_MODEL ?? 'claude-opus-4-7'

if (!SUPA_URL || !SUPA_KEY || !ANTHROPIC_KEY) {
  console.error('Env fehlt — brauche NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const onlyEmail = args.find(a => a.startsWith('--only='))?.split('=')[1]
const dryRun = args.includes('--dry-run')

const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const claude = new Anthropic({ apiKey: ANTHROPIC_KEY })

function extractToneAndLanguage(md: string): { tone: string | null; language: string | null } {
  let tone: string | null = null
  let language: string | null = null
  const sec10 = md.match(/^##\s*10\.\s*Tonprofil[\s\S]*?(?=^##\s|\Z)/m)
  if (sec10) {
    const body = sec10[0].replace(/^##\s*10\.[^\n]*\n/, '').replace(/^\([^)]*\)\n?/gm, '').trim()
    if (body) tone = body
  }
  const sec11 = md.match(/^##\s*11\.\s*Sprach[\s\S]*?(?=^##\s|\Z)/m)
  if (sec11) {
    const body = sec11[0].replace(/^##\s*11\.[^\n]*\n/, '').replace(/^\([^)]*\)\n?/gm, '').trim()
    if (body) language = body
  }
  return { tone, language }
}

async function generateProfile(answers: Record<string, string>) {
  const scanText = answersToScanText(answers)
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: PROFILER_PROMPT,
    messages: [{ role: 'user', content: `SCAN-OUTPUT:\n\n${scanText}` }],
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  const cleaned = text.trim()
  const { tone, language } = extractToneAndLanguage(cleaned)
  return {
    configMd: cleaned,
    toneOneliner: tone,
    languageMirror: language,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}

async function main() {
  console.log('═══ Bulk-Regenerate Coach-Profile (PROFILER v3.1) ═══')
  if (onlyEmail) console.log('  → nur für:', onlyEmail)
  if (dryRun) console.log('  → DRY-RUN — keine DB-Änderungen')
  console.log('')

  let query = supa
    .from('profiles')
    .select('id, email, full_name')
    .order('created_at', { ascending: true })
  if (onlyEmail) query = query.eq('email', onlyEmail)
  const { data: profiles, error } = await query
  if (error || !profiles) {
    console.error('profiles fehler:', error)
    process.exit(1)
  }

  let success = 0
  let skipped = 0
  let failed = 0

  for (const p of profiles) {
    process.stdout.write(`• ${p.email.padEnd(40)} `)

    const { data: resp } = await supa
      .from('questionnaire_responses')
      .select('id, answers, completed_at')
      .eq('user_id', p.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!resp) {
      console.log('⊘ kein abgeschlossener Fragebogen')
      skipped++
      continue
    }

    const answers = (resp.answers ?? {}) as Record<string, string>
    const answered = QUESTIONS.filter(q => Boolean(answers[String(q.id)])).length
    if (answered < TOTAL_QUESTIONS) {
      console.log(`⊘ nur ${answered}/${TOTAL_QUESTIONS} beantwortet`)
      skipped++
      continue
    }

    const { data: currentActive } = await supa
      .from('coach_profiles')
      .select('version')
      .eq('user_id', p.id)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (currentActive?.version ?? 0) + 1

    if (dryRun) {
      console.log(`→ würde v${nextVersion} generieren`)
      success++
      continue
    }

    try {
      const t0 = Date.now()
      const result = await generateProfile(answers)
      const took = Math.round((Date.now() - t0) / 1000)

      await supa
        .from('coach_profiles')
        .update({ is_active: false })
        .eq('user_id', p.id)
        .eq('is_active', true)

      const { error: insErr } = await supa.from('coach_profiles').insert({
        user_id: p.id,
        source_response_id: resp.id,
        config_md: result.configMd,
        tone_oneliner: result.toneOneliner,
        language_mirror: result.languageMirror,
        model: result.model,
        is_active: true,
        version: nextVersion,
        source: 'manual_refresh',
        memories_used_count: 0,
      })
      if (insErr) throw insErr

      const tone = result.toneOneliner ? '✓tone' : '⚠notone'
      const lang = result.languageMirror ? '✓lang' : '⚠nolang'
      console.log(`✓ v${nextVersion} (${took}s, ${result.inputTokens}+${result.outputTokens} tok, ${result.configMd.length} chars, ${tone}, ${lang})`)
      success++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`✗ ${msg}`)
      failed++
    }
  }

  console.log('')
  console.log('─────────────────────')
  console.log(`✓ ${success} regeneriert | ⊘ ${skipped} skipped | ✗ ${failed} failed`)
}

main().catch(e => { console.error(e); process.exit(1) })
