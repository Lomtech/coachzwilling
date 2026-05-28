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
  opts?: { isFreshConversation?: boolean },
): CoachSystemBlocks {
  const profileBlock = `=== PROFIL DES NUTZERS (Onboarding-Auswertung, intern, nicht zitieren) ===\n\n${coachProfileMd}\n\n=== ENDE PROFIL ===`

  const blocks: CoachSystemBlocks['blocks'] = [
    // Block 1: Profil ZUERST — dominiert die Aufmerksamkeit
    { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
    // Block 2: Universal-Regeln danach
    { type: 'text', text: COACH_SYSTEM_PROMPT },
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
• Wenn der User explizit sagt "du wiederholst dich" / "du hängst" / "du spinnst" / "du bist behindert" — BEKENNTNIS und Bruch. Nicht stoisch weitermachen. Beispiel: "Stimmt, war Wiederholung. Anderer Winkel: …" und dann ECHT neuer Gedanke.`
  )

  if (toneOneliner && toneOneliner.trim()) {
    tailParts.push(`STIMME (Tonprofil für DIESE Person): ${toneOneliner.trim()}`)
  }
  if (languageMirror && languageMirror.trim()) {
    tailParts.push(`SPRACHE: Spiegle 1-2 dieser charakteristischen Wendungen organisch in deiner Antwort, ohne sie zu zitieren:\n${languageMirror.trim()}`)
  }

  blocks.push({
    type: 'text',
    text: `=== FINALE ANWEISUNG (höchste Priorität — überstimmt Profil und Universal-Regeln) ===\n\n${tailParts.join('\n\n')}\n\nAntworte JETZT für DIESE Person, in IHRER Stimme, OHNE die Verbote zu brechen.`,
  })

  return { blocks }
}
