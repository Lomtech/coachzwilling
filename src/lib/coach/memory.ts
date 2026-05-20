import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import { serviceClient } from '@/lib/supabase/service'
import { MEMORY_EXTRACTOR_PROMPT, MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'
import type Anthropic from '@anthropic-ai/sdk'

export type MemorySection =
  | 'motivmuster' | 'stressmuster' | 'ausweich' | 'veraenderung'
  | 'coaching_stil' | 'breakthrough' | 'blocker' | 'goal' | 'identitaet'

export interface MemoryEntry {
  id: string
  section: MemorySection
  observation: string
  importance: number
  created_at: string
}

const MAX_MEMORY_ITEMS = 30 // wieviele Top-Einträge in System-Prompt

/**
 * Lädt das aktive Memory eines Users mit DIVERSITY-CONSTRAINT:
 * - Max 5 Einträge pro Sektion (verhindert Monokultur — z.B. 80% "ausweich" bei Mareike)
 * - Innerhalb der Sektion: Top-N nach Importance + Recency
 * - Über alle Sektionen: max MAX_MEMORY_ITEMS total
 */
const MAX_PER_SECTION = 5
const PROTECTED_SECTIONS: MemorySection[] = [
  'stressmuster', 'identitaet', 'breakthrough', 'coaching_stil',
] // diese Sektionen sind oft underrepresentiert — bekommen Vorrang

export async function loadMemoryForCoach(userId: string): Promise<string> {
  const supa = serviceClient()
  const { data, error } = await supa
    .from('coach_memory')
    .select('section, observation, importance, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })

  if (error || !data || data.length === 0) return ''

  // Schritt 1: gruppiere nach Sektion, capping pro Sektion
  const groupedRaw = new Map<MemorySection, Array<{ observation: string; importance: number }>>()
  for (const row of data) {
    const s = row.section as MemorySection
    if (!groupedRaw.has(s)) groupedRaw.set(s, [])
    groupedRaw.get(s)!.push({ observation: row.observation, importance: row.importance })
  }

  // Schritt 2: pro Sektion auf MAX_PER_SECTION cappen
  const cappedGroups = new Map<MemorySection, Array<{ observation: string; importance: number }>>()
  for (const [section, items] of groupedRaw) {
    cappedGroups.set(section, items.slice(0, MAX_PER_SECTION))
  }

  // Schritt 3: total cap durchsetzen — protected sections first, dann nach Importance
  const order: MemorySection[] = [
    ...PROTECTED_SECTIONS,
    'motivmuster', 'ausweich', 'veraenderung', 'goal', 'blocker',
  ]
  const finalGrouped = new Map<MemorySection, string[]>()
  let total = 0
  for (const section of order) {
    const items = cappedGroups.get(section)
    if (!items) continue
    const remaining = MAX_MEMORY_ITEMS - total
    if (remaining <= 0) break
    const take = items.slice(0, remaining)
    if (take.length === 0) continue
    finalGrouped.set(section, take.map(i => `- ${i.observation}`))
    total += take.length
  }

  // Schritt 4: render in Framework-Reihenfolge
  const renderOrder: MemorySection[] = [
    'motivmuster', 'stressmuster', 'ausweich', 'veraenderung',
    'coaching_stil', 'identitaet', 'goal', 'blocker', 'breakthrough',
  ]
  const lines: string[] = []
  for (const section of renderOrder) {
    const items = finalGrouped.get(section)
    if (!items || items.length === 0) continue
    lines.push(`### ${MEMORY_SECTION_LABELS[section]}`)
    lines.push(...items)
    lines.push('')
  }

  return lines.join('\n').trim()
}

/**
 * Hilfsfunktion: zählt für den Extractor wie oft jede Sektion in den letzten
 * N Memories vorkam. Wird im Extractor-Prompt als Hinweis an Haiku gegeben:
 * "diese Sektionen sind aktuell unterrepräsentiert, bevorzuge sie".
 */
async function loadSectionCounts(userId: string): Promise<Record<string, number>> {
  const supa = serviceClient()
  const { data } = await supa
    .from('coach_memory')
    .select('section')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20)

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.section] = (counts[row.section] ?? 0) + 1
  }
  return counts
}

/**
 * Extrahiert nach einem Coach-Turn EINE neue Beobachtung aus dem Gespräch
 * und persistiert sie in coach_memory. Idempotent — schreibt nur wenn das LLM
 * eine sinnvolle Sektion zurückgibt.
 */
export async function extractMemoryFromTurn(args: {
  userId: string
  conversationId: string
  assistantMessageId: string | null
  userMessage: string
  assistantReply: string
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<MemoryEntry | null> {
  const { userId, conversationId, assistantMessageId, userMessage, assistantReply, recentHistory } = args

  const historyText = (recentHistory ?? [])
    .slice(-6)
    .map(m => `[${m.role.toUpperCase()}] ${m.content}`)
    .join('\n\n')

  // Diversity-Hint: zeige dem Extractor welche Sektionen aktuell unterrepräsentiert sind
  const counts = await loadSectionCounts(userId)
  const allSections = ['motivmuster','stressmuster','ausweich','veraenderung','coaching_stil','breakthrough','blocker','goal','identitaet']
  const underrep = allSections.filter(s => (counts[s] ?? 0) < 2)
  const overrep = allSections.filter(s => (counts[s] ?? 0) >= 5)

  const diversityHint = underrep.length > 0 || overrep.length > 0
    ? `\n\nDIVERSITY-HINWEIS (für diesen User):\n` +
      (underrep.length > 0 ? `• Aktuell UNTERREPRÄSENTIERT (bevorzuge wenn passend): ${underrep.join(', ')}\n` : '') +
      (overrep.length > 0 ? `• Aktuell ÜBERREPRÄSENTIERT (nur wählen wenn deutlich NEUE Beobachtung): ${overrep.join(', ')}` : '')
    : ''

  const turnText = `${historyText}\n\n[USER] ${userMessage}\n\n[COACH] ${assistantReply}${diversityHint}`

  try {
    const res = await anthropic().messages.create({
      model: MEMORY_MODEL,
      max_tokens: 300,
      system: MEMORY_EXTRACTOR_PROMPT,
      messages: [{ role: 'user', content: turnText }],
    })

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // Parse JSON-Output, tolerant gegen Wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as {
      section?: string
      observation?: string
      importance?: number
    }

    if (!parsed.section || parsed.section === 'none' || !parsed.observation) return null

    const validSections: MemorySection[] = [
      'motivmuster', 'stressmuster', 'ausweich', 'veraenderung',
      'coaching_stil', 'breakthrough', 'blocker', 'goal', 'identitaet',
    ]
    if (!validSections.includes(parsed.section as MemorySection)) return null

    const supa = serviceClient()
    const { data, error } = await supa
      .from('coach_memory')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        source_msg_id: assistantMessageId,
        section: parsed.section as MemorySection,
        observation: parsed.observation.trim(),
        context_excerpt: userMessage.slice(0, 200),
        importance: Math.max(1, Math.min(10, parsed.importance ?? 5)),
      })
      .select('id, section, observation, importance, created_at')
      .single()

    if (error || !data) {
      console.error('[memory] insert failed', error)
      return null
    }

    return {
      id: data.id,
      section: data.section as MemorySection,
      observation: data.observation,
      importance: data.importance,
      created_at: data.created_at,
    }
  } catch (e) {
    console.error('[memory] extract failed', e)
    return null
  }
}
