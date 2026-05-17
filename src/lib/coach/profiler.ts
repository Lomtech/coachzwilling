import 'server-only'
import { anthropic, PROFILER_MODEL } from '@/lib/claude/client'
import { PROFILER_PROMPT, PROFILE_REFINE_PROMPT, MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'
import { answersToScanText } from '@/data/questionnaire'

export interface ProfilerResult {
  configMd: string
  model: string
  inputTokens: number
  outputTokens: number
}

export async function generateCoachProfile(
  answers: Record<string, string>
): Promise<ProfilerResult> {
  const scanText = answersToScanText(answers)
  const userMessage = `SCAN-OUTPUT:\n\n${scanText}`

  const res = await anthropic().messages.create({
    model: PROFILER_MODEL,
    max_tokens: 4096,
    system: PROFILER_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  return {
    configMd: text.trim(),
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
    max_tokens: 4096,
    system: PROFILE_REFINE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')

  return {
    configMd: text.trim(),
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}

import type Anthropic from '@anthropic-ai/sdk'
