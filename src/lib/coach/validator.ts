import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import { FIRST_TURN_VALIDATOR_PROMPT } from '@/lib/coach/prompts'
import type Anthropic from '@anthropic-ai/sdk'

export interface ValidationResult {
  passes: boolean
  problem?: string
}

/**
 * Haiku-Validator: prüft eine Coach-Antwort gegen das Tonprofil.
 * Wird NUR beim 1. Turn einer Conversation aufgerufen (~1s Latenz).
 * Bei späteren Turns vertrauen wir der Stil-Adaption.
 */
export async function validateFirstTurn(args: {
  toneProfile: string | null
  userMessage: string
  coachReply: string
}): Promise<ValidationResult> {
  // Kein Tonprofil → keine Validierung möglich
  if (!args.toneProfile || args.toneProfile.trim().length === 0) {
    return { passes: true }
  }

  try {
    const prompt = FIRST_TURN_VALIDATOR_PROMPT
      .replace('{TONE_PROFILE}', args.toneProfile)
      .replace('{USER_MESSAGE}', args.userMessage)
      .replace('{COACH_REPLY}', args.coachReply)

    const res = await anthropic().messages.create({
      model: MEMORY_MODEL, // Haiku — schnell + billig
      max_tokens: 200,
      system: 'Du bist ein präziser Stil-Validator. Antwort: nur JSON.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { passes: true } // bei Parse-Fail: durchlassen

    const parsed = JSON.parse(jsonMatch[0]) as { passt?: boolean; problem?: string }
    return {
      passes: parsed.passt !== false,
      problem: parsed.problem,
    }
  } catch (e) {
    console.error('[validator] failed', e)
    return { passes: true } // Fail-open
  }
}

/**
 * Korrektur-Instruktion für den Coach bei nicht-bestandener Validierung.
 * Wird als zusätzlicher User-Message-Suffix beim Retry mitgegeben.
 */
export function buildCorrectionInstruction(problem: string): string {
  return `\n\n[SYSTEM-KORREKTUR an den Coach, nicht sichtbar für den Nutzer: Deine vorherige Antwort hat den Stil nicht getroffen. Konkret: ${problem}. Antworte jetzt nochmal, dieses Mal stil-konform. Direkt, ohne Meta-Kommentar.]`
}
