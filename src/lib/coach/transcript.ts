import 'server-only'
import { serviceClient } from '@/lib/supabase/service'

// Token-Budget für den Transcript-Block im Refine-Call.
// Opus 4.7 hat 200k Kontext — wir lassen Luft für altes Profil (~10k),
// Memories (~5-10k) und 42 Onboarding-Antworten (~3-5k).
const TRANSCRIPT_TOKEN_BUDGET = 120_000

// Konservative Schätzung: deutsches Markdown ~3.5 Zeichen pro Token
const CHARS_PER_TOKEN = 3.5

export interface TranscriptResult {
  transcript: string
  conversationCount: number
  messageCount: number
  truncatedConversations: number
}

/**
 * Lädt den VOLLSTÄNDIGEN Chat-Verlauf eines Users aus allen Conversations,
 * formatiert als Markdown-Transcript für den Refine-Prompt.
 *
 * Strategie:
 * - Conversations chronologisch (älteste zuerst)
 * - Wenn Token-Budget erreicht: NEUESTE Conversations werden bevorzugt
 *   eingeschlossen, älteste mit einem Hinweis "X ältere Gespräche
 *   gekürzt — sind aber in den Memory-Beobachtungen destilliert".
 * - Bei wirklich grossen Verläufen schützen wir Opus vor Token-Overflow.
 */
export async function buildFullTranscript(userId: string): Promise<TranscriptResult> {
  const supa = serviceClient()

  // Alle Conversations des Users
  const { data: convs } = await supa
    .from('conversations')
    .select('id, title, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!convs || convs.length === 0) {
    return {
      transcript: '(Noch keine Coaching-Gespräche — der User hat das Onboarding abgeschlossen, aber noch nicht mit dem Coach gechattet.)',
      conversationCount: 0,
      messageCount: 0,
      truncatedConversations: 0,
    }
  }

  // Alle Messages aller Conversations in einem Query
  const conversationIds = convs.map(c => c.id)
  const { data: msgs } = await supa
    .from('messages')
    .select('conversation_id, role, content, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true })

  // Messages pro Conversation gruppieren
  const msgsByConv = new Map<string, Array<{ role: string; content: string; created_at: string }>>()
  for (const m of msgs ?? []) {
    if (!msgsByConv.has(m.conversation_id)) msgsByConv.set(m.conversation_id, [])
    msgsByConv.get(m.conversation_id)!.push(m)
  }

  // Conversation-Blöcke bauen (neueste zuerst, damit bei Truncation die
  // ältesten gekürzt werden — die ältesten sind ohnehin schon in Memory
  // destilliert)
  const reversedConvs = [...convs].reverse()
  const renderedBlocks: Array<{ index: number; text: string; chars: number }> = []
  const budgetChars = TRANSCRIPT_TOKEN_BUDGET * CHARS_PER_TOKEN
  let totalChars = 0
  let truncatedAt: number | null = null

  for (let i = 0; i < reversedConvs.length; i++) {
    const conv = reversedConvs[i]
    const convMsgs = msgsByConv.get(conv.id) ?? []
    if (convMsgs.length === 0) continue

    const title = conv.title?.trim() || '(ohne Titel)'
    const date = new Date(conv.created_at).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })

    const lines: string[] = [`### Gespräch vom ${date} — ${title}`]
    for (const m of convMsgs) {
      const role = m.role === 'user' ? 'User' : 'Coach'
      lines.push(`**${role}:** ${m.content.trim()}`)
    }
    lines.push('')
    const block = lines.join('\n')

    // Hartes Cap: wenn dieses einzelne Gespräch das Restbudget sprengt UND
    // wir schon mindestens 1 Gespräch drin haben → abbrechen.
    if (totalChars + block.length > budgetChars && renderedBlocks.length > 0) {
      truncatedAt = i
      break
    }

    renderedBlocks.push({ index: i, text: block, chars: block.length })
    totalChars += block.length
  }

  // Zurück in chronologische Reihenfolge (ältestes zuerst) für Lesefluss
  renderedBlocks.reverse()
  const blocks = renderedBlocks.map(b => b.text)

  let header = ''
  let truncatedCount = 0
  if (truncatedAt !== null) {
    truncatedCount = reversedConvs.length - truncatedAt
    header =
      `*(Hinweis: ${truncatedCount} ältere Gespräche wurden für die Token-Budgetierung gekürzt — ` +
      `ihre Substanz steckt aber in den Memory-Beobachtungen unten. Fokussiere auf die ` +
      `${renderedBlocks.length} jüngeren Gespräche unten.)*\n\n`
  }

  return {
    transcript: header + blocks.join('\n'),
    conversationCount: convs.length,
    messageCount: msgs?.length ?? 0,
    truncatedConversations: truncatedCount,
  }
}

/**
 * Formatiert die 42 Onboarding-Antworten als Roh-Block für den Refine-Prompt.
 * Gibt null zurück wenn keine completed response existiert.
 */
export async function loadOnboardingRaw(userId: string): Promise<string | null> {
  const supa = serviceClient()
  const { data } = await supa
    .from('questionnaire_responses')
    .select('answers, completed_at')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.answers) return null

  // Lazy import damit transcript.ts nicht beim ersten Modul-Load die
  // ganze Questionnaire-Definition pullt
  const { answersToScanText } = await import('@/data/questionnaire')
  return answersToScanText(data.answers as Record<string, string>)
}
