import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import { serviceClient } from '@/lib/supabase/service'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Commitments-Extractor.
 *
 * Läuft nach jedem Coach-Reply (parallel zum normalen Memory-Extractor).
 * Scannt den User-Turn auf konkrete Zusagen ("Ich schicke morgen 20 Bewerbungen raus")
 * UND scannt den User-Turn auf Erledigungen früherer Commitments
 * ("Ja hab 18 verschickt" → resolved).
 *
 * Output dient als Material für die Follow-up-Emails — dort ist das die
 * "Goldquelle": konkrete Anker an die der Coach in der Mail anknüpfen kann.
 *
 * Modell: Haiku (schnell + billig, ~$0.0005 pro Call).
 * Fail-safe: bei Fehler wird die Memory-Extraction nicht blockiert.
 */

const EXTRACT_PROMPT = `Du analysierst einen Coaching-Turn auf zwei Dinge:

A) NEUE COMMITMENTS — hat der Klient in DIESEM Turn etwas konkretes zugesagt zu tun?
   Beispiele: "Ich rede heute mit X", "Ich schicke morgen 20 Bewerbungen raus", "Bis Freitag liefer ich Y".
   Kein Commitment: "Ich überlege das", "Vielleicht", "Wenn ich Zeit habe", reine Reflexionen.

B) RESOLUTIONS — bezieht sich der Klient auf eine VORHANDENE Zusage und sagt was Konkretes dazu?
   Wenn ja: gib die ID des Commitments + status (fulfilled / cancelled / forgotten) + kurze Note.

INPUT
Letzte Coach-Frage: {COACH_QUESTION}
User-Antwort: {USER_REPLY}

Vorhandene offene Commitments dieses Users:
{OPEN_COMMITMENTS}

OUTPUT — reines JSON, keine Erklärung:
{
  "new_commitments": [
    { "text": "<konkrete Zusage, 1 Satz, in 3. Person formuliert: 'Der Klient ...'>",
      "due_hint": "<heute|morgen|diese Woche|bis Freitag|null>",
      "importance": <1-10>
    }
  ],
  "resolutions": [
    { "commitment_id": "<UUID aus der Liste oben>",
      "status": "fulfilled" | "cancelled" | "forgotten",
      "note": "<1 Satz Kontext>"
    }
  ]
}

REGELN
- new_commitments leer wenn nichts substantielles zugesagt wurde
- resolutions leer wenn der Turn nichts mit offenen Commitments zu tun hat
- importance: 8-10 nur für Lebens-Entscheidungen, 4-7 für normale Aufgaben, 1-3 für triviale Sachen`

interface ExtractInput {
  userId: string
  conversationId: string
  sourceMsgId: string | null
  coachQuestion: string
  userReply: string
}

export async function extractCommitmentsFromTurn(args: ExtractInput): Promise<void> {
  // Skip wenn User-Reply zu kurz für Substanz
  if (args.userReply.trim().length < 10) return

  const supa = serviceClient()

  // Offene Commitments des Users laden (für Resolution-Matching)
  const { data: openCommits } = await supa
    .from('commitments')
    .select('id, text, due_hint')
    .eq('user_id', args.userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(20)

  const commitsBlock = (openCommits ?? []).length > 0
    ? (openCommits ?? []).map(c => `- [${c.id}] ${c.text}${c.due_hint ? ` (${c.due_hint})` : ''}`).join('\n')
    : '(keine offenen Commitments)'

  const prompt = EXTRACT_PROMPT
    .replace('{COACH_QUESTION}', args.coachQuestion.slice(0, 800))
    .replace('{USER_REPLY}', args.userReply.slice(0, 1200))
    .replace('{OPEN_COMMITMENTS}', commitsBlock)

  let raw: string
  try {
    const res = await anthropic().messages.create({
      model: MEMORY_MODEL,
      max_tokens: 600,
      system: 'Du extrahierst Commitments + Resolutions aus Coaching-Turns. Output: reines JSON.',
      messages: [{ role: 'user', content: prompt }],
    })
    raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
  } catch (e) {
    console.error('[commitments] Haiku failed', e)
    return
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return

  let parsed: {
    new_commitments?: Array<{ text?: string; due_hint?: string | null; importance?: number }>
    resolutions?: Array<{ commitment_id?: string; status?: string; note?: string }>
  }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[commitments] JSON parse fail', e, raw.slice(0, 200))
    return
  }

  // Neue Commitments insertieren
  const newCommits = (parsed.new_commitments ?? [])
    .filter(c => typeof c.text === 'string' && c.text.trim().length >= 5)
    .slice(0, 5) // hard cap pro Turn
  if (newCommits.length > 0) {
    const rows = newCommits.map(c => ({
      user_id: args.userId,
      conversation_id: args.conversationId,
      source_msg_id: args.sourceMsgId,
      text: c.text!.trim(),
      due_hint: c.due_hint?.trim() || null,
      importance: Math.max(1, Math.min(10, c.importance ?? 5)),
      status: 'open',
    }))
    const { error } = await supa.from('commitments').insert(rows)
    if (error) console.error('[commitments] insert failed', error)
  }

  // Resolutions: bestehende Commitments updaten
  const resolutions = (parsed.resolutions ?? []).filter(
    r =>
      typeof r.commitment_id === 'string' &&
      ['fulfilled', 'cancelled', 'forgotten'].includes(r.status ?? ''),
  )
  for (const r of resolutions) {
    const { error } = await supa
      .from('commitments')
      .update({
        status: r.status,
        resolved_at: new Date().toISOString(),
        resolution_note: r.note?.slice(0, 500) ?? null,
      })
      .eq('id', r.commitment_id!)
      .eq('user_id', args.userId)
    if (error) console.error('[commitments] resolution update failed', error)
  }

  if (newCommits.length > 0 || resolutions.length > 0) {
    console.log(`[commitments] user=${args.userId} new=${newCommits.length} resolved=${resolutions.length}`)
  }
}
