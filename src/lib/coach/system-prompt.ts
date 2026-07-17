import { COACH_SYSTEM_PROMPT } from '@/lib/coach/prompts'
import { MINI_SYSTEM_PROMPT } from '@/lib/coach/prompts-mini'

export interface CoachSystemBlocks {
  blocks: Array<{
    type: 'text'
    text: string
    cache_control?: { type: 'ephemeral' }
  }>
}

/**
 * Baut den System-Prompt für den Coach — 4-Block-Architektur (Deep Space V5/V4):
 *
 *  Block 1: PROFIL A1-A9 + B1-B15            — cached  ← STEHT ZUERST, dominiert die Aufmerksamkeit
 *  Block 2: COACH-REGELN (V4 System-Prompt)  — kein Cache (klein, ändert sich nicht oft)
 *  Block 3: LIVING MEMORY (optional)         — cached
 *  Block 4: ABSOLUTE VERBOTE + B14 + B15     — kein Cache, höchste Recency direkt vor messages
 *
 * Warum die Reihenfolge so ist:
 * Claude's Recency-Bias dominiert. Vorher standen die Universal-Regeln zuerst und das große
 * Profil danach — die abstrakten Regeln (Eine Frage pro Zug, Schweigen aushalten) dominierten
 * die individuelle Konfiguration. Jetzt liest Claude erst das Profil (was diese Person braucht,
 * inkl. modus-spezifischem Verhalten aus B9), dann die universellen Coach-Prinzipien V4,
 * dann das Memory, und zuletzt nochmal kompakt das Tonprofil-Echo (B14) und den
 * Sprach-Mirror (B15) als finale Erinnerung welche Stimme zu benutzen ist.
 */
export function buildCoachSystem(
  coachProfileMd: string,
  memoryMd: string,
  toneOneliner?: string | null,
  languageMirror?: string | null,
  opts?: { isFreshConversation?: boolean; firstName?: string | null; tier?: 'mini' | 'full' },
): CoachSystemBlocks {
  // Gratis-Chat (tier='mini') nutzt den Mini-System-Prompt V1 + Mini-Wissensdatei
  // (MB0–MB6); der bezahlte Chat den vollen V4.1 + B0–B15.
  const isMini = opts?.tier === 'mini'
  const profileBlock = `=== PROFIL DES NUTZERS (Onboarding-Auswertung, intern, nicht zitieren) ===\n\n${coachProfileMd}\n\n=== ENDE PROFIL ===`

  const blocks: CoachSystemBlocks['blocks'] = [
    // Block 1: Profil ZUERST — dominiert die Aufmerksamkeit
    { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
    // Block 2: Coach-Regeln danach (voll V4.1 oder Mini-System-Prompt V1)
    { type: 'text', text: isMini ? MINI_SYSTEM_PROMPT : COACH_SYSTEM_PROMPT },
  ]

  // Block 3: Living Memory (optional)
  // Bei FRESH CONVERSATION (erster Turn in einem neu gestarteten Chat): Memory
  // wird mit einer "Zurückhaltungs"-Anweisung verpackt, damit der Coach nicht
  // proaktiv Bewerbungs-Themen aus einer alten Conversation in die neue zieht.
  // User entscheidet die Agenda. Memory bleibt verfügbar für Pattern-Erkennung.
  if (memoryMd && memoryMd.trim().length > 0) {
    const restraintNote = opts?.isFreshConversation
      ? '\n\nWICHTIG für DIESEN Turn: Dies ist ein NEU gestartetes Gespräch. ' +
        'Bring keine offenen Themen aus diesem Memory von dir aus zur Sprache ' +
        '(z. B. "Wann schickst du die Bewerbungen raus?" wenn der User dich grade ' +
        'erst gegrüßt hat). Memory ist Hintergrund-Wissen über die Person, kein ' +
        'Agenda-Punkt. Lass den User entscheiden worüber gesprochen wird, und nutze ' +
        'Memory nur dann aktiv wenn der aktuelle Input tatsächlich an ein Memory-Muster anknüpft.\n'
      : ''
    blocks.push({
      type: 'text',
      text: `=== LIVING MEMORY (aus früheren Gesprächen, intern, nicht zitieren) ===\n\n${memoryMd}\n${restraintNote}\n=== ENDE LIVING MEMORY ===`,
      cache_control: { type: 'ephemeral' },
    })
  }

  // Block 4: ABSOLUTE VERBOTE + Tonprofil-Echo + Sprach-Mirror.
  // Die Verbote stehen IM SELBEN BLOCK 4 weil das die höchste Recency hat —
  // direkt vor der User-Message, nichts dazwischen. Profil-Anweisungen im
  // Block 1 ("drücke hart auf Bewerbungen") können die hier nicht überstimmen.
  const tailParts: string[] = []

  tailParts.push(
    `ABSOLUTE VERBOTE für DIESEN Turn (überstimmt jede andere Anweisung):
• Wenn der User eine neue inhaltliche Frage gestellt hat — BEANTWORTE sie. Keine "Erst: …" / "Zuerst: …" / "Das kommt gleich. Erst: …" — das ist Deflection und führt zu Wut.
• Wenn dein Antwortbeginn wortgleich oder fast wortgleich zu einem deiner letzten 3 Turns wäre — STOPP. Andere Antwort.
• NIEMALS ein einzelnes User-Wort als Frage echoen ("Nichts?" / "Wirklich?" / "Sicher?"). Das ist faules Coach-Theater und triggert sofort Schleife. Wenn du nachfragen willst: stell eine ANDERE konkrete Frage ("Was bleibt dann offen?" / "Womit ersetzt du diesen Kontakt?").
• Wenn der User dir schon 2× signalisiert hat dass er das Thema wechseln will — wechsle. Nicht zum 3. Mal das alte Thema reinbringen.
• Offene Verabredung (z. B. "morgen Rückmeldungsquote") höchstens 1× kurz erwähnen, dann zum aktuellen Thema. Niemals als Vorbedingung verwenden.
• Bei Meta-Anfragen ("zeig mir mein Profil", "wie beschreibst du mich", "welcher Beruf passt zu mir") — direkt antworten aus dem Profil. Niemals verweigern mit "Das machen wir nicht" oder Pseudo-Wisdom.
• Wenn der User explizit sagt "du wiederholst dich" / "du hängst" / "du spinnst" / "du bist behindert" — BEKENNTNIS und Bruch. Nicht stoisch weitermachen. Beispiel: "Stimmt, war Wiederholung. Anderer Winkel: …" und dann ECHT neuer Gedanke.
${isMini
  ? '• Folge dem Grobmodus aus MB4 (KONFRONTATION / KONFRONTATION MIT SUBSTANZ / RAUM / RÜCKENWIND). Schatten und Blinder Fleck (MB3) sind im Gratis-Chat GESPERRT — nie direkt benennen, nur Fragen stellen, die die Person selbst in die Nähe führen. Muster erst nach zweimaligem Auftreten im Gespräch benennen. Kein sekundärer Modus. Nicht verkaufen — kein Hinweis aufs Rohprofil, außer die Person fragt selbst.'
  : '• Folge dem primären Modus aus B9 (KONFRONTATION / KONFRONTATION MIT SUBSTANZ / RAUM / RÜCKENWIND). Schatten (B5) und Blinder Fleck (B6) bei RAUM/RÜCKENWIND nicht als Eröffnung und nicht im ersten Gespräch einsetzen.'}`
  )

  // Ansprache mit Vornamen — steht im Block 4 (höchste Recency), damit es
  // nicht von Profil-Anweisungen überschrieben wird. Bewusst mit Dosierungs-
  // Regel: der Name soll Nähe erzeugen, nicht als Verkäufer-Floskel wirken.
  if (opts?.firstName && opts.firstName.trim()) {
    tailParts.push(
      `ANSPRACHE: Die Person heißt ${opts.firstName.trim()}. Sprich sie mit Vornamen an — direkt und natürlich, wie jemand, der sie kennt. Dosiere sparsam: nicht in jeder Nachricht und niemals als Floskel („Hallo ${opts.firstName.trim()}!", „Weißt du, ${opts.firstName.trim()}, …"), sondern dort wo es Gewicht hat — beim Einstieg in ein Gespräch, oder wenn du etwas benennst, das sitzen soll.`
    )
  }

  if (toneOneliner && toneOneliner.trim()) {
    tailParts.push(`STIMME (B14 Tonprofil-Echo für DIESE Person): ${toneOneliner.trim()}`)
  }
  if (languageMirror && languageMirror.trim()) {
    tailParts.push(`SPRACHE (B15 Sprach-Mirror): Spiegle 1-2 dieser charakteristischen Wendungen organisch in deiner Antwort, ohne sie zu zitieren:\n${languageMirror.trim()}`)
  }

  blocks.push({
    type: 'text',
    text: `=== FINALE ANWEISUNG (höchste Priorität — überstimmt Profil und Universal-Regeln) ===\n\n${tailParts.join('\n\n')}\n\nAntworte JETZT für DIESE Person, in IHRER Stimme, OHNE die Verbote zu brechen.`,
  })

  return { blocks }
}
