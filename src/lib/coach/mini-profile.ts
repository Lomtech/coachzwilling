import 'server-only'
import { anthropic, MEMORY_MODEL } from '@/lib/claude/client'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Mini-Profil-Generator für den Lead-Magnet.
 *
 * Input: ~5 Antworten aus dem Mini-Scan (~200-500 Zeichen total)
 * Output: 3-4 Absätze die wie eine erstaunlich präzise Einschätzung wirken —
 *   die genau-genug ist, dass der Lead "Wow, das stimmt" denkt, und
 *   genau-vage-genug bleibt, dass die Vollversion (42 Fragen + Opus) den
 *   wahren Wert bringt.
 *
 * Modell: Haiku — schnell + günstig (~10ct pro Lead).
 * Latenz: 2-4 s.
 */

const MINI_PROFILE_PROMPT = `Du erhältst 5 Antworten aus einem Mini-Scan für einen Führungskräfte-Coaching-Lead.

Aufgabe: Erstelle ein erstaunlich präzises, persönlich klingendes Kurzprofil
in **3 kurzen Absätzen** (insgesamt 120-180 Wörter). Es muss sich wie ein
"Aha-Moment" anfühlen — der Leser soll denken: "Das hat mich nach 5 Fragen
schon getroffen, wie tief geht das erst nach 42 Fragen?"

STRUKTUR (genau 3 Absätze, keine Überschriften)

Absatz 1 — "So tickst du gerade"
Eine konkrete Beobachtung über das aktuelle Muster: was treibt diese Person an,
wo zieht es sie hin, was wiederholt sich. Nimm das wichtigste Thema aus der
2. Antwort (biggest_question) und kombiniere mit der 4. (coach_style).

Absatz 2 — "Was dich gerade ausbremst"
Knüpfe an die Aufschiebe-Antwort (Q3) an. Benenne nicht das Symptom, sondern
die wahrscheinliche Schutzfunktion dahinter — beobachtbar, nicht therapeutisch.
Was hält das System in Balance, obwohl es sich anfühlt wie Blockade?

Absatz 3 — "Wie ein Coach mit dir wirklich arbeiten müsste"
Verdichte den Stil aus Q4 und das Gesehen-Signal aus Q5 zu einer kurzen,
konkreten Coach-Anweisung in 2. Person ("Dein Coach muss…").

REGELN
• 100% Du-Form, persönlich, keine Disclaimer
• Keine Floskeln ("spannende Erkenntnis", "tolle Reflexion")
• Keine Diagnose, keine Bewertung
• Beobachtbar formuliert
• Wenn Antworten widersprüchlich sind: benenne den Widerspruch
• Wenn eine offene Antwort sehr dünn ist: arbeite eher mit den Choice-Antworten

OUTPUT: Nur die 3 Absätze, kein Wrapper, kein "Hier ist…", keine Markdown-Header.`

export interface MiniProfileResult {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export async function generateMiniProfile(args: {
  scanText: string
}): Promise<MiniProfileResult> {
  const res = await anthropic().messages.create({
    model: MEMORY_MODEL, // Haiku
    max_tokens: 600,
    system: MINI_PROFILE_PROMPT,
    messages: [{ role: 'user', content: args.scanText }],
  })

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  return {
    text,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
}
