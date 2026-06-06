import 'server-only'
import { anthropic, PROFILER_MODEL } from '@/lib/claude/client'
import { PROFILER_PROMPT, PROFILE_REFINE_PROMPT, MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'
import { answersToScanText } from '@/data/questionnaire'

export interface ProfilerResult {
  configMd: string
  toneOneliner: string | null      // aus Sektion 10 extrahiert
  languageMirror: string | null    // aus Sektion 11 extrahiert
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Extrahiert B14 (Tonprofil-Echo) und B15 (Sprach-Mirror) aus dem generierten
 * Deep-Space-V5-Profil. Splittet das Markdown an `^## `-Headern (A1–A9 und
 * B1–B15 sind die strukturierenden Header). Backwards-compatible: alte Profile
 * mit "## 10. Tonprofil-Echo" / "## 11. Sprach-Mirror" werden ebenfalls erkannt,
 * damit Refreshes auf historischen Profilen nicht brechen.
 */
function extractToneAndLanguage(md: string): { tone: string | null; language: string | null } {
  // Splitte das Markdown an Section-Headern. Akzeptiert: `## A1.`, `## B14.`,
  // `## 10.` (legacy v3.x), jeweils mit optionalem Whitespace.
  const sectionParts = md.split(/(?=^##\s+(?:[AB]?\d+)\.\s+)/m)

  function findSection(patterns: string[]): string | null {
    for (const part of sectionParts) {
      for (const p of patterns) {
        if (part.match(new RegExp(`^##\\s*${p}`, 'i'))) {
          const body = part
            .replace(/^##[^\n]*\n/, '')
            .replace(/^\([^)]*\)\n?/gm, '') // (PFLICHT, ...) Hinweise weg
            .trim()
          return body.length > 0 ? body : null
        }
      }
    }
    return null
  }

  return {
    // B14 (V5) oder 10. Tonprofil-Echo (legacy v3.x)
    tone: findSection(['B14\\.\\s*Tonprofil', '10\\.\\s*Tonprofil']),
    // B15 (V5) oder 11. Sprach-Mirror (legacy v3.x)
    language: findSection(['B15\\.\\s*Sprach', '11\\.\\s*Sprach']),
  }
}

export async function generateCoachProfile(
  answers: Record<string, string>
): Promise<ProfilerResult> {
  const scanText = answersToScanText(answers)
  const userMessage = `SCAN-OUTPUT:\n\n${scanText}`

  const res = await anthropic().messages.create({
    model: PROFILER_MODEL,
    max_tokens: 8192, // Profile haben ~5-7k Output — 4096 hat alle 4 Profile bei Punkt 8/9 abgeschnitten
    system: PROFILER_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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

/**
 * Tiefen-Refresh: liest alle vier Datenquellen und baut daraus eine neue
 * Profilversion. Im Gegensatz zur frühen Memory-only-Variante bekommt Opus
 * jetzt den ROHEN Chat-Verlauf zu sehen — keine Destillation mehr.
 *
 * Quellen:
 *   1. oldConfigMd       — aktuelles Profil (Ausgangspunkt)
 *   2. scanRaw           — die 42 Onboarding-Antworten roh (Selbstbild)
 *   3. memories          — Haiku-Beobachtungen aus dem Coaching (Destillat)
 *   4. transcript        — der vollständige Roh-Chat-Verlauf (Evidenz)
 *
 * Token-Profil typisch: 30k-100k input → ~1-2$ pro Refresh.
 * Latenz: ~60-120s (Opus mit grossem Kontext).
 */
export async function refineCoachProfile(args: {
  oldConfigMd: string
  scanRaw: string | null
  memories: Array<{ section: string; observation: string; importance: number }>
  transcript: string
}): Promise<ProfilerResult> {
  // Memory gruppiert nach Sektion
  const grouped = new Map<string, Array<{ observation: string; importance: number }>>()
  for (const m of args.memories) {
    if (!grouped.has(m.section)) grouped.set(m.section, [])
    grouped.get(m.section)!.push({ observation: m.observation, importance: m.importance })
  }

  const memBlocks: string[] = []
  for (const [section, items] of grouped) {
    const label = MEMORY_SECTION_LABELS[section] ?? section
    memBlocks.push(`### ${label}`)
    for (const it of items) {
      memBlocks.push(`- (${it.importance}/10) ${it.observation}`)
    }
    memBlocks.push('')
  }

  const memoryText = memBlocks.length > 0
    ? memBlocks.join('\n').trim()
    : '(noch keine Memory-Einträge)'

  const scanBlock = args.scanRaw
    ? args.scanRaw
    : '(keine Onboarding-Antworten verfügbar — User wurde vermutlich vor dem Tracking onboarded)'

  const userMessage = [
    '## QUELLE 1 — BESTEHENDES PROFIL (aktueller Stand)',
    '',
    args.oldConfigMd,
    '',
    '---',
    '',
    '## QUELLE 2 — ROHE ONBOARDING-ANTWORTEN (50 Fragen, Selbstbild)',
    '',
    scanBlock,
    '',
    '---',
    '',
    '## QUELLE 3 — MEMORY-BEOBACHTUNGEN (Haiku-Destillat aus den Coaching-Gesprächen)',
    '',
    memoryText,
    '',
    '---',
    '',
    '## QUELLE 4 — VOLLSTÄNDIGER CHAT-VERLAUF (Roh-Evidenz)',
    '',
    args.transcript,
  ].join('\n')

  const res = await anthropic().messages.create({
    model: PROFILER_MODEL,
    max_tokens: 8192,
    system: PROFILE_REFINE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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

import type Anthropic from '@anthropic-ai/sdk'
