import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import { PROBE_PROMPT } from '@/lib/coach/prompts'
import type Anthropic from '@anthropic-ai/sdk'

export const PROBE_MIN_CHARS = 40 // unter dieser Schwelle wird Probe angeboten
export const MAX_PROBES_PER_SCAN = 5 // hard-cap pro Onboarding-Session

/**
 * Generiert eine kontextspezifische Vertiefungsfrage aus einer kurzen Antwort.
 * Nutzt Haiku (günstig + schnell, ~1-2s Latenz). Returnt null bei Fehler →
 * Frontend zeigt dann einen Fallback-Text.
 */
export async function generateProbeQuestion(args: {
  question: string
  answer: string
}): Promise<string | null> {
  try {
    const prompt = PROBE_PROMPT
      .replace('{QUESTION}', args.question)
      .replace('{ANSWER}', args.answer)

    const res = await anthropic().messages.create({
      model: MEMORY_MODEL, // Haiku — billig + schnell
      max_tokens: 120,
      system: 'Du folgst dem User-Prompt exakt. Output: nur die Frage, keine Wrapper.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      // entferne Anführungszeichen falls Haiku sie trotzdem setzt
      .replace(/^["„'](.*)["""']$/, '$1')
      .trim()

    if (text.length < 5 || text.length > 300) return null
    return text
  } catch (e) {
    console.error('[probe] generation failed', e)
    return null
  }
}
