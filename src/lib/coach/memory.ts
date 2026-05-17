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
 * Lädt das aktive Memory eines Users (Top-N nach Importance/Recency),
 * gruppiert nach Sektion. Format optimiert für den Coach-System-Prompt.
 */
export async function loadMemoryForCoach(userId: string): Promise<string> {
  const supa = serviceClient()
  const { data, error } = await supa
    .from('coach_memory')
    .select('section, observation, importance, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_MEMORY_ITEMS)

  if (error || !data || data.length === 0) return ''

  // Gruppiert nach Sektion in der Reihenfolge des Frameworks
  const order: MemorySection[] = [
    'motivmuster', 'stressmuster', 'ausweich', 'veraenderung',
    'coaching_stil', 'identitaet', 'goal', 'blocker', 'breakthrough',
  ]
  const grouped = new Map<MemorySection, string[]>()
  for (const row of data) {
    const s = row.section as MemorySection
    if (!grouped.has(s)) grouped.set(s, [])
    grouped.get(s)!.push(`- ${row.observation}`)
  }

  const lines: string[] = []
  for (const section of order) {
    const items = grouped.get(section)
    if (!items || items.length === 0) continue
    lines.push(`### ${MEMORY_SECTION_LABELS[section]}`)
    lines.push(...items)
    lines.push('')
  }

  return lines.join('\n').trim()
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

  const turnText = `${historyText}\n\n[USER] ${userMessage}\n\n[COACH] ${assistantReply}`

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
