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
 * Extrahiert Sektion 10 (Tonprofil-Echo) und Sektion 11 (Sprach-Mirror) aus dem
 * generierten Profil. Tolerant gegen kleine Formatierungs-Abweichungen.
 */
function extractToneAndLanguage(md: string): { tone: string | null; language: string | null } {
  const lines = md.split('\n')
  let tone: string | null = null
  let language: string | null = null

  // Sektion 10: alles zwischen "## 10." und nächster "## " Header
  const sec10Match = md.match(/^##\s*10\.\s*Tonprofil[\s\S]*?(?=^##\s|\Z)/m)
  if (sec10Match) {
    const body = sec10Match[0]
      .replace(/^##\s*10\.[^\n]*\n/, '') // Header weg
      .replace(/^\([^)]*\)\n?/gm, '') // (PFLICHT, ...)-Hinweise weg falls vom LLM mitgeschrieben
      .trim()
    if (body.length > 0) tone = body
  }

  // Sektion 11: gleiches Pattern
  const sec11Match = md.match(/^##\s*11\.\s*Sprach[\s\S]*?(?=^##\s|\Z)/m)
  if (sec11Match) {
    const body = sec11Match[0]
      .replace(/^##\s*11\.[^\n]*\n/, '')
      .replace(/^\([^)]*\)\n?/gm, '')
      .trim()
    if (body.length > 0) language = body
  }

  return { tone, language }
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
 * Refresh: kombiniert das bestehende Profil mit den Memory-Erkenntnissen
 * zu einer neuen, geschärften Profil-Version.
 */
export async function refineCoachProfile(args: {
  oldConfigMd: string
  memories: Array<{ section: string; observation: string; importance: number }>
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
    : '(noch keine Memory-Einträge — nur Onboarding-Profil aktualisieren falls nötig)'

  const userMessage = `BESTEHENDES PROFIL\n\n${args.oldConfigMd}\n\n---\n\nBEOBACHTUNGEN AUS COACHING-GESPRÄCHEN\n\n${memoryText}`

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
