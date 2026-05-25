import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import { serviceClient } from '@/lib/supabase/service'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Follow-up-Email-Compose-Service.
 *
 * Liest profil + offene Commitments + aktive Memories → Haiku komponiert
 * eine personalisierte 3-Satz-Email die KONKRET an offene Punkte aus dem
 * Coaching anknüpft. Kein generisches "Wie geht's?". Kein Newsletter.
 *
 * Output ist JSON: { subject, body_text, body_html, source_summary }
 *   - source_summary für Debugging: was floss in die Komposition?
 *   - body_html ist die formatierte Version, body_text der plain-Fallback
 *
 * Kosten pro Mail: ~$0.0008 (Haiku, ~500 in / 200 out).
 */

const COMPOSE_PROMPT = `Du komponierst eine kurze persönliche Follow-up-Email vom Coach an seinen Klienten.

KONTEXT (alles intern, nie zitieren):
- Klient: {FULL_NAME}
- Tage seit letztem Chat: {DAYS_SINCE_LAST_CHAT}
- Tonprofil (so klingt der Coach mit dieser Person): {TONE_ONELINER}
- Sprach-Mirror (Wörter die der Klient selbst nutzt): {LANGUAGE_MIRROR}

OFFENE COMMITMENTS (was hat der Klient zugesagt zu tun):
{COMMITMENTS}

AKTUELLE MEMORY-EINTRÄGE (was beschäftigt ihn gerade):
{MEMORIES}

AUFGABE
Schreib eine Email die sich anfühlt wie "der Coach hat mitgedacht — nicht wie ein Newsletter".

REGELN
• Subject: 4-8 Wörter, eine konkrete Referenz zu einem Commitment oder Memory.
  Kein "Wie geht's?", kein "Update", kein "Hallo".
  Beispiele guter Subjects:
    - "Die 20 Bewerbungen — was kam zurück?"
    - "Solingen-Gespräch: Hast du's angesprochen?"
    - "Status: Kollege X"
• Body: 3-4 kurze Sätze. Im Tonprofil dieser Person.
  Struktur:
    1. Konkreter Anker (ein Commitment oder ein Memory-Punkt benennen)
    2. EINE direkte Frage dazu
    3. Optional: ein zweiter Mini-Anker oder Ermutigung in Person-Stimme
    4. CTA-Satz: "Schreib hier rein:" + (Platzhalter wird durch Link ersetzt)
• Verwende 1-2 Wörter aus dem Sprach-Mirror organisch (nicht zitieren)
• NIEMALS: "Liebe Grüße", "Beste Grüße", "Hallo Markus", Floskeln, Therapeuten-Sprache
• Knappe Sätze. Punkt. Keine Verzweigungen.

OUTPUT-FORMAT — reines JSON, keine Markdown-Wrapper, keine Erklärung:
{
  "subject": "<4-8 Wörter>",
  "body": "<3-4 Sätze, plain text, mit \\n\\n zwischen Absätzen, am Ende: 'Schreib hier rein: {LINK}'>",
  "source_summary": "<1 Satz auf Deutsch: was war der Hauptanker für diese Mail?>"
}`

const MEMORY_SECTION_LABELS: Record<string, string> = {
  motivmuster: 'Motiv-/Verhaltensmuster',
  stressmuster: 'Stress-/Druckmuster',
  ausweich: 'Ausweich-/Selbsttäuschung',
  veraenderung: 'Veränderungs-/Umsetzungslogik',
  coaching_stil: 'Coaching-Stil',
  identitaet: 'Selbstbild/Identität',
  goal: 'Aktuelle Ziele',
  blocker: 'Aktuelle Blocker',
  breakthrough: 'Durchbrüche',
}

export interface ComposedFollowup {
  subject: string
  bodyText: string
  bodyHtml: string
  sourceSummary: string
}

export interface CandidateForFollowup {
  userId: string
  fullName: string | null
  email: string
  toneOneliner: string | null
  languageMirror: string | null
  daysSinceLastChat: number
  commitments: Array<{ id: string; text: string; due_hint: string | null }>
  memories: Array<{ section: string; observation: string; importance: number }>
}

/**
 * Lädt alle Daten für eine Follow-up-Komposition aus der DB.
 * Returnt null wenn der User nicht eligible ist (kein aktives Profil etc.).
 */
export async function loadCandidate(userId: string): Promise<CandidateForFollowup | null> {
  const supa = serviceClient()

  const [{ data: profile }, { data: cp }, { data: commits }, { data: mems }, { data: lastMsg }] =
    await Promise.all([
      supa.from('profiles').select('full_name, email').eq('id', userId).maybeSingle(),
      supa
        .from('coach_profiles')
        .select('tone_oneliner, language_mirror')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle(),
      supa
        .from('commitments')
        .select('id, text, due_hint, importance')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),
      supa
        .from('coach_memory')
        .select('section, observation, importance')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
      supa
        .from('messages')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (!profile?.email || !cp) return null

  const lastChatMs = lastMsg?.created_at ? new Date(lastMsg.created_at).getTime() : null
  const daysSince = lastChatMs ? Math.floor((Date.now() - lastChatMs) / (24 * 60 * 60 * 1000)) : 999

  return {
    userId,
    fullName: profile.full_name,
    email: profile.email,
    toneOneliner: cp.tone_oneliner,
    languageMirror: cp.language_mirror,
    daysSinceLastChat: daysSince,
    commitments: (commits ?? []).map(c => ({ id: c.id, text: c.text, due_hint: c.due_hint })),
    memories: (mems ?? []).map(m => ({
      section: m.section,
      observation: m.observation,
      importance: m.importance,
    })),
  }
}

/**
 * Komponiert die Email via Haiku. Returnt null bei Compose-Fail.
 */
export async function composeFollowup(args: {
  candidate: CandidateForFollowup
  ctaUrl: string
}): Promise<ComposedFollowup | null> {
  const c = args.candidate

  const commitmentsBlock = c.commitments.length > 0
    ? c.commitments.map(x => `- ${x.text}${x.due_hint ? ` (geplant: ${x.due_hint})` : ''}`).join('\n')
    : '(keine offenen Commitments — Anker aus Memory wählen)'

  const memoriesBlock = c.memories.length > 0
    ? c.memories
        .map(m => `- [${MEMORY_SECTION_LABELS[m.section] ?? m.section}] (${m.importance}/10) ${m.observation}`)
        .join('\n')
    : '(noch keine Memory-Einträge)'

  const userMessage = COMPOSE_PROMPT
    .replace('{FULL_NAME}', c.fullName ?? '(Name unbekannt)')
    .replace('{DAYS_SINCE_LAST_CHAT}', String(c.daysSinceLastChat))
    .replace('{TONE_ONELINER}', c.toneOneliner ?? '(kein Tonprofil — direkt, knapp)')
    .replace('{LANGUAGE_MIRROR}', c.languageMirror ?? '(keine Sprach-Notiz)')
    .replace('{COMMITMENTS}', commitmentsBlock)
    .replace('{MEMORIES}', memoriesBlock)

  let raw: string
  try {
    const res = await anthropic().messages.create({
      model: MEMORY_MODEL,
      max_tokens: 600,
      system: 'Du komponierst Coach-Emails. Output: nur reines JSON, kein Wrapper.',
      messages: [{ role: 'user', content: userMessage }],
    })
    raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
  } catch (e) {
    console.error('[followup] Haiku compose failed', e)
    return null
  }

  // JSON extrahieren (Haiku produziert manchmal trotz Anweisung Markdown-Wrapper)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[followup] no JSON in compose output', raw.slice(0, 200))
    return null
  }

  let parsed: { subject?: string; body?: string; source_summary?: string }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('[followup] JSON parse fail', e, raw.slice(0, 200))
    return null
  }

  if (!parsed.subject || !parsed.body) return null

  const bodyText = parsed.body.replace('{LINK}', args.ctaUrl).trim()
  const bodyHtml = renderHtml({
    bodyText,
    ctaUrl: args.ctaUrl,
    fullName: c.fullName,
  })

  return {
    subject: parsed.subject.slice(0, 200),
    bodyText,
    bodyHtml,
    sourceSummary: (parsed.source_summary ?? '').slice(0, 500),
  }
}

function renderHtml(args: {
  bodyText: string
  ctaUrl: string
  fullName: string | null
}): string {
  // Plain-Text mit Auto-Links in HTML konvertieren. Bewusst minimal:
  // E-Mail-Apps rendern komplexe HTML-Templates oft schlecht in Dark-Mode,
  // und unsere Coach-Tonalität ist konversationell — kein "Marketing-Bling".
  const escaped = args.bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const withLinkBtn = escaped.replace(
    args.ctaUrl,
    `<a href="${args.ctaUrl}" style="color:#1a1a1a;font-weight:600;text-decoration:underline;">→ Im Coach öffnen</a>`,
  )

  const paragraphs = withLinkBtn.split(/\n\n+/).map(p => `<p style="margin:0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`).join('')

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dein Coach</title>
</head>
<body style="margin:0;padding:24px 16px;background:#fafaf8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;">
    <tr><td>
      <div style="font-size:14px;color:#888;margin-bottom:24px;">
        Coaching·Zwilling${args.fullName ? ` · für ${args.fullName.split(' ')[0]}` : ''}
      </div>
      <div style="font-size:16px;">
        ${paragraphs}
      </div>
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e0;font-size:12px;color:#999;">
        Diese Mail ist Teil deiner Follow-ups vom Coaching-Zwilling.
        <a href="${args.ctaUrl}" style="color:#999;">Einstellungen</a> ·
        in der Mail-App findest du oben den "Abbestellen"-Link für sofortiges Pausieren.
      </div>
    </td></tr>
  </table>
</body>
</html>`
}
