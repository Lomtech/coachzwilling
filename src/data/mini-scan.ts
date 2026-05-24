/**
 * Mini-Scan: 5 destillierte Fragen die einen Lead in 90 Sekunden zu einem
 * brauchbaren Kurzprofil führen. Bewusst eine Mischung aus Stil-Antworten
 * (Multiple-Choice für schnelles Tempo) und 1-2 offenen Fragen für Substanz.
 *
 * Die Fragen sind so gewählt, dass Haiku daraus ein erstaunlich präzises
 * 3-Absatz-Kurzprofil ableiten kann — als "Aha-Moment" der den Lead
 * zum Buchen der Vollversion bewegt.
 */

export interface MiniScanQuestion {
  id: string
  prompt: string
  helper?: string
  type: 'open' | 'choice'
  options?: Array<{ value: string; label: string }>
  minChars?: number
}

export const MINI_SCAN_QUESTIONS: MiniScanQuestion[] = [
  {
    id: 'role',
    prompt: 'Welche Rolle hast du gerade?',
    type: 'choice',
    options: [
      { value: 'gf_kmu', label: 'Geschäftsführer (KMU)' },
      { value: 'team_lead', label: 'Team-/Bereichsleiter' },
      { value: 'manager', label: 'Manager (mittleres Mgmt)' },
      { value: 'founder', label: 'Gründer / Unternehmer' },
      { value: 'expert', label: 'Senior Expert ohne Führungsrolle' },
      { value: 'other', label: 'Etwas anderes' },
    ],
  },
  {
    id: 'biggest_question',
    prompt: 'Was ist die wichtigste Frage, mit der du gerade beruflich ringst?',
    helper: 'In eigenen Worten — 1–3 Sätze. Je konkreter, desto besser das Profil.',
    type: 'open',
    minChars: 30,
  },
  {
    id: 'last_blocker',
    prompt: 'Was hast du zuletzt aufgeschoben, obwohl es wichtig wäre?',
    helper: 'Eine konkrete Sache. Kein Coaching-Sprech.',
    type: 'open',
    minChars: 20,
  },
  {
    id: 'coach_style',
    prompt: 'Was hilft dir mehr?',
    type: 'choice',
    options: [
      { value: 'direct', label: 'Direkter Spiegel — sag mir was du siehst' },
      { value: 'questions', label: 'Gute Fragen — bring mich selbst auf die Antwort' },
      { value: 'options', label: 'Optionen — zeig mir Wege, ich entscheide' },
      { value: 'reframe', label: 'Reframing — drehe das Problem auf den Kopf' },
    ],
  },
  {
    id: 'feels_seen',
    prompt: 'Wann fühlst du dich von einem Gespräch wirklich verstanden?',
    helper: 'Was muss der andere tun oder nicht tun?',
    type: 'open',
    minChars: 25,
  },
]

export const MINI_SCAN_TOTAL = MINI_SCAN_QUESTIONS.length

export function miniScanAnswersToText(answers: Record<string, string>): string {
  return MINI_SCAN_QUESTIONS.map(q => {
    const a = answers[q.id]
    if (!a) return null
    const labelled = q.type === 'choice'
      ? (q.options?.find(o => o.value === a)?.label ?? a)
      : a
    return `Q: ${q.prompt}\nA: ${labelled}`
  }).filter(Boolean).join('\n\n')
}
