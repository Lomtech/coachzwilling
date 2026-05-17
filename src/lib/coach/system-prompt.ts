import { COACH_SYSTEM_PROMPT } from '@/lib/coach/prompts'

export interface CoachSystemBlocks {
  blocks: Array<{
    type: 'text'
    text: string
    cache_control?: { type: 'ephemeral' }
  }>
}

/**
 * Baut den System-Prompt für den Coach — 3-Block-Architektur:
 *  1. Rolle/Regeln (statisch) — kein Cache
 *  2. Coach-Profil (stabil pro User, ~2-4k Tok) — cached
 *  3. Living Memory (wächst nach jeder Session, ~0-2k Tok) — cached
 *
 * Caching: ein Cache-Hit pro Session ist realistisch. Wenn neue Memory-Einträge
 * dazukommen, wird beim nächsten Call neu gecached (Cache-Write +25 %, dann
 * wieder 90 % Discount).
 */
export function buildCoachSystem(coachProfileMd: string, memoryMd: string): CoachSystemBlocks {
  const profileBlock = `=== PROFIL DES NUTZERS (Onboarding-Auswertung, intern, nicht zitieren) ===\n\n${coachProfileMd}\n\n=== ENDE PROFIL ===`

  const blocks: CoachSystemBlocks['blocks'] = [
    { type: 'text', text: COACH_SYSTEM_PROMPT },
    { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
  ]

  if (memoryMd && memoryMd.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: `=== LIVING MEMORY (aus früheren Gesprächen, intern, nicht zitieren) ===\n\n${memoryMd}\n\n=== ENDE LIVING MEMORY ===`,
      cache_control: { type: 'ephemeral' },
    })
  }

  return { blocks }
}
