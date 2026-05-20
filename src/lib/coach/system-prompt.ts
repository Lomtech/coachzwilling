import { COACH_SYSTEM_PROMPT } from '@/lib/coach/prompts'

export interface CoachSystemBlocks {
  blocks: Array<{
    type: 'text'
    text: string
    cache_control?: { type: 'ephemeral' }
  }>
}

/**
 * Baut den System-Prompt für den Coach — 4-Block-Architektur (Architect-Review v3.3):
 *
 *  Block 1: PROFIL (groß, ~6-8k Tok)         — cached  ← STEHT ZUERST, dominiert die Aufmerksamkeit
 *  Block 2: COACH-REGELN (universal)         — kein Cache (klein, ändert sich nicht oft)
 *  Block 3: LIVING MEMORY (optional)         — cached
 *  Block 4: TONPROFIL-ECHO (1-2 Sätze)       — kein Cache, höchste Recency direkt vor messages
 *
 * Warum die Reihenfolge umgedreht ist:
 * Claude's Recency-Bias dominiert. Vorher standen die Universal-Regeln zuerst und das große
 * Profil danach — die abstrakten Regeln (Eine Frage pro Zug, Schweigen aushalten) dominierten
 * die individuelle Konfiguration. Jetzt liest Claude erst das Profil (was diese Person braucht),
 * dann die universellen Coach-Prinzipien, dann das Memory, und zuletzt nochmal kompakt
 * das Tonprofil als finale Erinnerung welche Stimme zu benutzen ist.
 */
export function buildCoachSystem(
  coachProfileMd: string,
  memoryMd: string,
  toneOneliner?: string | null,
  languageMirror?: string | null,
): CoachSystemBlocks {
  const profileBlock = `=== PROFIL DES NUTZERS (Onboarding-Auswertung, intern, nicht zitieren) ===\n\n${coachProfileMd}\n\n=== ENDE PROFIL ===`

  const blocks: CoachSystemBlocks['blocks'] = [
    // Block 1: Profil ZUERST — dominiert die Aufmerksamkeit
    { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
    // Block 2: Universal-Regeln danach
    { type: 'text', text: COACH_SYSTEM_PROMPT },
  ]

  // Block 3: Living Memory (optional)
  if (memoryMd && memoryMd.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: `=== LIVING MEMORY (aus früheren Gesprächen, intern, nicht zitieren) ===\n\n${memoryMd}\n\n=== ENDE LIVING MEMORY ===`,
      cache_control: { type: 'ephemeral' },
    })
  }

  // Block 4: Tonprofil-Echo + Sprach-Mirror als finale Anweisung (höchste Recency)
  const tailParts: string[] = []
  if (toneOneliner && toneOneliner.trim()) {
    tailParts.push(`STIMME (Tonprofil für DIESE Person): ${toneOneliner.trim()}`)
  }
  if (languageMirror && languageMirror.trim()) {
    tailParts.push(`SPRACHE: Spiegle 1-2 dieser charakteristischen Wendungen organisch in deiner Antwort, ohne sie zu zitieren:\n${languageMirror.trim()}`)
  }
  if (tailParts.length > 0) {
    blocks.push({
      type: 'text',
      text: `=== FINALE ANWEISUNG (höchste Priorität) ===\n\n${tailParts.join('\n\n')}\n\nAntworte JETZT für DIESE Person, in IHRER Stimme.`,
    })
  }

  return { blocks }
}
