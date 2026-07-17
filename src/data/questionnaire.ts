// Deep Space — Fragebogen V3 (Stand 5.6.26)
// Denkhorizonte | Deepling
// Scan-Modus: eine Frage nach der anderen, keine Bewertung, keine Kommentierung.
// An fünf definierten Stellen (Q4, Q21, Q30, Q33, Q40) wird eine einzige
// Nachfrage gestellt — diese sind hier als `followUp` markiert. Nur dort,
// nirgendwo sonst.

export type QuestionType = 'open' | 'single'

export interface QuestionOption {
  value: string
  label: string
}

export interface Question {
  id: number
  section: string
  type: QuestionType
  prompt: string
  helper?: string
  options?: QuestionOption[]
  placeholder?: string
  /**
   * Feste Nachfrage gemäss V3-Doc — wird nach der eigentlichen Antwort gestellt.
   * Nur an den fünf in der Doc markierten Stellen (Q4, Q21, Q30, Q33, Q40).
   */
  followUp?: string
  /**
   * In welchem Teil die Nachfrage gestellt wird. Default = Teil der Frage selbst.
   * Sonderfall Q4: Frage liegt in Teil 1, ihre Nachfrage ist aber der
   * Pflicht-Einstieg von Teil 2 (Vertiefung) — daher followUpPart: 2.
   */
  followUpPart?: 1 | 2
}

export const SECTIONS = [
  '1. Ressourcen & Realität',
  '2. Ziel vs. Weg vs. Identität',
  '3. Motivstruktur',
  '4. Emotionales Grundmuster',
  '5. Weltbild & Entscheidungslogik',
  '6. Ehrlichkeit & Selbstbild',
  '7. Umsetzung',
  '8. Coaching-Stil & Veränderung',
  '9. Zukunft & Energie',
  '10. Stärke, Schatten & Entwicklung',
  '11. Sinn von Deepling',
  '12. Grenzen',
  '13. Kontext',
] as const

export const QUESTIONS: Question[] = [
  // ─── 1. Ressourcen & Realität ──────────────────────────────
  {
    id: 1, section: SECTIONS[0], type: 'open',
    prompt: 'In welchem Bereich deines Lebens fühlst du dich aktuell am meisten zufrieden, lebendig oder „bei dir"?',
  },
  {
    id: 2, section: SECTIONS[0], type: 'open',
    prompt: 'Was genau daran tut dir gut?',
  },
  {
    id: 3, section: SECTIONS[0], type: 'open',
    prompt: 'In welchem Bereich entsteht aktuell am meisten Reibung, Unruhe oder Entwicklungsdruck?',
  },
  {
    id: 4, section: SECTIONS[0], type: 'open',
    prompt: 'Was genau daran beschäftigt dich wirklich?',
    followUp: 'Was ist der Teil davon, den du dir selbst gegenüber noch nicht ganz zugegeben hast?',
    followUpPart: 2, // Nachfrage wird als Pflicht-Einstieg von Teil 2 gestellt, nicht in Teil 1
  },

  // ─── 2. Ziel vs. Weg vs. Identität ─────────────────────────
  {
    id: 5, section: SECTIONS[1], type: 'single',
    prompt: 'Was fühlt sich für dich aktuell am wichtigsten an?',
    options: [
      { value: 'ergebnis', label: 'Ein klares Ergebnis erreichen' },
      { value: 'weg', label: 'Eine gute Zeit auf dem Weg haben' },
      { value: 'identitaet', label: 'So leben, wie du eigentlich sein willst' },
    ],
  },
  {
    id: 6, section: SECTIONS[1], type: 'single',
    prompt: 'Wenn du auf die nächsten 12 Monate blickst – was würde dich am meisten zufrieden machen?',
    options: [
      { value: 'fortschritt', label: 'Messbare Fortschritte' },
      { value: 'alltag', label: 'Ein stimmiger Alltag' },
      { value: 'innen', label: 'Innere Entwicklung' },
    ],
  },
  {
    id: 7, section: SECTIONS[1], type: 'single',
    prompt: 'Wann zweifelst du eher an dir?',
    options: [
      { value: 'ziele', label: 'Wenn du Ziele nicht erreichst' },
      { value: 'alltag', label: 'Wenn sich dein Alltag nicht gut anfühlt' },
      { value: 'integritaet', label: 'Wenn du nicht so handelst, wie du es für richtig hältst' },
    ],
  },

  // ─── 3. Motivstruktur ──────────────────────────────────────
  {
    id: 8, section: SECTIONS[2], type: 'single',
    prompt: 'Wenn niemand führt – was machst du typischerweise?',
    options: [
      { value: 'uebernehmen', label: 'Ich übernehme' },
      { value: 'beobachten', label: 'Ich beobachte' },
      { value: 'verbinden', label: 'Ich versuche zu verbinden' },
      { value: 'rueckzug', label: 'Ich ziehe mich zurück' },
    ],
  },
  {
    id: 9, section: SECTIONS[2], type: 'single',
    prompt: 'Was stresst dich stärker?',
    options: [
      { value: 'kontrolle', label: 'Keine Kontrolle zu haben' },
      { value: 'unklar', label: 'Unklare Strukturen' },
      { value: 'spannung', label: 'Spannungen zwischen Menschen' },
      { value: 'eingeschraenkt', label: 'Eingeschränkt zu sein' },
    ],
  },
  {
    id: 10, section: SECTIONS[2], type: 'single',
    prompt: 'Was gibt dir am meisten Stabilität?',
    options: [
      { value: 'einfluss', label: 'Einfluss' },
      { value: 'klarheit', label: 'Klarheit / Struktur' },
      { value: 'beziehung', label: 'Beziehung / Vertrauen' },
      { value: 'freiheit', label: 'Freiheit' },
    ],
  },
  {
    id: 11, section: SECTIONS[2], type: 'single',
    prompt: 'Was triggert dich am meisten an anderen?',
    options: [
      { value: 'schwaeche', label: 'Schwäche oder Zögern' },
      { value: 'chaos', label: 'Chaos oder Unklarheit' },
      { value: 'kaelte', label: 'Kälte oder Egoismus' },
      { value: 'kontrolle', label: 'Kontrolle oder Einschränkung' },
    ],
  },

  // ─── 4. Emotionales Grundmuster ────────────────────────────
  {
    id: 12, section: SECTIONS[3], type: 'single',
    prompt: 'Wenn etwas schiefläuft – dein erster innerer Impuls:',
    options: [
      { value: 'rueckzug', label: 'Rückzug / Unsicherheit' },
      { value: 'aerger', label: 'Ärger / Widerstand' },
    ],
  },
  {
    id: 13, section: SECTIONS[3], type: 'single',
    prompt: 'Was trifft dich stärker?',
    options: [
      { value: 'ablehnung', label: 'Ablehnung' },
      { value: 'kontrollverlust', label: 'Kontrollverlust' },
    ],
  },
  {
    id: 14, section: SECTIONS[3], type: 'single',
    prompt: 'Unter Druck wirst du eher:',
    options: [
      { value: 'ruhig', label: 'Ruhiger / zurückhaltender' },
      { value: 'direkt', label: 'Direkter / konfrontativer' },
    ],
  },
  {
    id: 15, section: SECTIONS[3], type: 'single',
    prompt: 'Dein innerer Dialog klingt eher wie:',
    options: [
      { value: 'hoffentlich', label: '„Hoffentlich geht das gut…"' },
      { value: 'kann_nicht_sein', label: '„Das kann doch nicht sein…"' },
    ],
  },

  // ─── 5. Weltbild & Entscheidungslogik ──────────────────────
  {
    id: 16, section: SECTIONS[4], type: 'single',
    prompt: 'Was treibt dich aktuell am meisten an?',
    options: [
      { value: 'entwicklung', label: 'Entwicklung und Wachstum' },
      { value: 'sicherheit', label: 'Sicherheit und Stabilität' },
      { value: 'erfolg', label: 'Erfolg und Ergebnisse' },
      { value: 'zugehoerigkeit', label: 'Zugehörigkeit und Verbindung' },
      { value: 'sinn', label: 'Sinn und Wirkung' },
    ],
  },
  {
    id: 17, section: SECTIONS[4], type: 'single',
    prompt: 'Wenn Menschen unterschiedliche Meinungen haben, denkst du eher:',
    options: [
      { value: 'eine_richtige', label: 'Es gibt eine richtige Lösung' },
      { value: 'klar_vertreten', label: 'Ich vertrete klar meine Sicht' },
      { value: 'zuhoeren', label: 'Ich höre mir alles an' },
      { value: 'integrieren', label: 'Ich versuche zu integrieren' },
      { value: 'perspektivisch', label: 'Alles ist perspektivisch' },
    ],
  },
  {
    id: 18, section: SECTIONS[4], type: 'single',
    prompt: 'Wie triffst du wichtige Entscheidungen?',
    options: [
      { value: 'intuitiv', label: 'Intuitiv' },
      { value: 'regelbasiert', label: 'Regelbasiert' },
      { value: 'zielorientiert', label: 'Zielorientiert' },
      { value: 'werteorientiert', label: 'Werteorientiert' },
      { value: 'systemisch', label: 'Systemisch / langfristig' },
    ],
  },

  // ─── 6. Ehrlichkeit & Selbstbild ───────────────────────────
  {
    id: 19, section: SECTIONS[5], type: 'open',
    prompt: 'In welchen Situationen erzählst du dir selbst Dinge, die dir helfen – aber vielleicht nicht ganz stimmen?',
  },
  {
    id: 20, section: SECTIONS[5], type: 'open',
    prompt: 'Was würden Menschen, die dich gut kennen, über dich sagen, was du selbst nicht so gerne siehst?',
  },
  {
    id: 21, section: SECTIONS[5], type: 'open',
    prompt: 'Wo weichst du aktuell eher aus, obwohl du weißt, dass es eigentlich dran wäre?',
    followUp: 'Was genau passiert in dir, wenn du dir vorstellst, es anzugehen? Was schützt du damit?',
  },

  // ─── 7. Umsetzung ──────────────────────────────────────────
  {
    id: 22, section: SECTIONS[6], type: 'single',
    prompt: 'Wenn du dir etwas vornimmst – was passiert typischerweise?',
    options: [
      { value: 'umsetzen', label: 'Ich setze es um' },
      { value: 'starten_verlieren', label: 'Ich starte, verliere aber den Fokus' },
      { value: 'denken_wenig_tun', label: 'Ich denke viel, tue wenig' },
    ],
  },
  {
    id: 23, section: SECTIONS[6], type: 'single',
    prompt: 'Was hält dich aktuell am meisten zurück?',
    options: [
      { value: 'unklarheit', label: 'Unklarheit' },
      { value: 'angst', label: 'Angst' },
      { value: 'bequemlichkeit', label: 'Bequemlichkeit' },
      { value: 'zweifel', label: 'Zweifel' },
    ],
  },
  {
    id: 24, section: SECTIONS[6], type: 'single',
    prompt: 'Nach einer guten Erkenntnis:',
    options: [
      { value: 'schnell_um', label: 'Setze ich schnell um' },
      { value: 'kurz_an', label: 'Es hält kurz an' },
      { value: 'verpufft', label: 'Es verpufft' },
    ],
  },

  // ─── 8. Coaching-Stil & Veränderung ────────────────────────
  {
    id: 25, section: SECTIONS[7], type: 'single',
    prompt: 'Was bringt dich wirklich weiter?',
    helper: 'Denk an eine Situation, in der du wirklich etwas gelernt hast – was war der Auslöser?',
    options: [
      { value: 'direkt_gesagt', label: 'Jemand hat mir direkt gesagt, was nicht stimmt' },
      { value: 'raum_zeit', label: 'Ich hatte Raum und Zeit zum Nachdenken' },
      { value: 'gezeigt_moeglich', label: 'Jemand hat mir gezeigt, was möglich ist' },
    ],
  },
  {
    id: 26, section: SECTIONS[7], type: 'single',
    prompt: 'Wann wächst du am meisten?',
    helper: 'Woran hast du in der Vergangenheit gemerkt, dass ein Impuls wirklich etwas bewegt hat?',
    options: [
      { value: 'blinde_flecken', label: 'Ich wurde auf blinde Flecken gestoßen, die ich nicht sehen wollte' },
      { value: 'durchbruch_distanz', label: 'Ich hab selbst den Durchbruch gehabt – durch Ruhe und Distanz' },
      { value: 'rueckenwind', label: 'Ich habe Rückenwind gespürt und bin mutiger geworden' },
    ],
  },
  {
    id: 27, section: SECTIONS[7], type: 'single',
    prompt: 'Wie viel Veränderung willst du aktuell wirklich?',
    helper: 'Stell dir vor, der Deepling verändert in 6 Monaten drei zentrale Dinge in deinem Verhalten. Wie reagierst du innerlich?',
    options: [
      { value: 'genau_will', label: 'Das ist genau das, was ich will' },
      { value: 'umfeld', label: 'Interessant – aber ich frage mich, was das für mein Umfeld bedeutet' },
      { value: 'druck', label: 'Das macht mir ehrlich gesagt etwas Druck' },
    ],
  },
  {
    id: 28, section: SECTIONS[7], type: 'single',
    prompt: 'Was ist aktuell wichtiger?',
    options: [
      { value: 'raus_komfort', label: 'Raus aus der Komfortzone' },
      { value: 'stabilitaet', label: 'Stabilität behalten' },
    ],
  },

  // ─── 9. Zukunft & Energie ──────────────────────────────────
  {
    id: 29, section: SECTIONS[8], type: 'single',
    prompt: 'Hast du ein Bild von deiner Zukunft, das dich wirklich zieht?',
    options: [
      { value: 'ja', label: 'Ja' },
      { value: 'teilweise', label: 'Teilweise' },
      { value: 'kaum', label: 'Kaum' },
    ],
  },
  {
    id: 30, section: SECTIONS[8], type: 'open',
    prompt: 'Was würdest du tun, wenn du mutiger wärst?',
    followUp: 'Und was genau hält dich davon ab – wirklich?',
  },
  {
    id: 31, section: SECTIONS[8], type: 'single',
    prompt: 'Was fehlt dir aktuell am meisten?',
    options: [
      { value: 'klarheit', label: 'Klarheit' },
      { value: 'energie', label: 'Energie' },
      { value: 'mut', label: 'Mut' },
    ],
  },

  // ─── 10. Stärke, Schatten & Entwicklung (neu in V3) ────────
  // Offene Fragen, keine Mehrfachauswahl. Nachfrage nur bei Q33.
  {
    id: 32, section: SECTIONS[9], type: 'open',
    prompt: 'Welche Eigenschaft hat am meisten zu deinem Erfolg beigetragen?',
    helper: 'Eine Antwort – so konkret wie möglich.',
  },
  {
    id: 33, section: SECTIONS[9], type: 'open',
    prompt: 'Wann wurde genau diese Eigenschaft zuletzt zum Problem – für dich oder für andere?',
    helper: 'Konkretes Beispiel.',
    followUp: 'Was genau ist dort passiert – und was hätte es gebraucht, damit es anders läuft?',
  },
  {
    id: 34, section: SECTIONS[9], type: 'open',
    prompt: 'Welche Kritik hörst du seit Jahren immer wieder – auch wenn du sie innerlich nicht ganz akzeptierst?',
  },
  {
    id: 35, section: SECTIONS[9], type: 'open',
    prompt: 'Was bekommen andere von dir ab, wenn du müde, enttäuscht oder unter Druck bist?',
  },
  {
    id: 36, section: SECTIONS[9], type: 'open',
    prompt: 'Welche wichtige Entscheidung schiebst du seit längerer Zeit vor dir her?',
    helper: 'Nicht der aktuelle Anlass – das wiederkehrende Muster.',
  },
  {
    id: 37, section: SECTIONS[9], type: 'open',
    prompt: 'Was ist der offizielle Grund dafür – und was ist vermutlich der ehrlichere Grund?',
  },
  {
    id: 38, section: SECTIONS[9], type: 'open',
    prompt: 'Welche Verhaltensweisen bei anderen regen dich besonders schnell auf?',
  },
  {
    id: 39, section: SECTIONS[9], type: 'open',
    prompt: 'Mit welchem Menschentyp würdest du freiwillig niemals ein Unternehmen, Projekt oder Team führen – und warum?',
  },

  // ─── 11. Sinn von Deepling ───────────────────────
  {
    id: 40, section: SECTIONS[10], type: 'open',
    prompt: 'Warum willst du diesen Deepling nutzen – wirklich?',
    followUp: 'Was ist der eigentliche Grund – den du vielleicht noch niemandem so direkt gesagt hast?',
  },
  {
    id: 41, section: SECTIONS[10], type: 'open',
    prompt: 'Woran würdest du erkennen, dass er dir hilft?',
  },
  {
    id: 42, section: SECTIONS[10], type: 'open',
    prompt: 'Wovor soll er dich im besten Fall bewahren?',
  },

  // ─── 12. Grenzen ───────────────────────────────────────────
  {
    id: 43, section: SECTIONS[11], type: 'open',
    prompt: 'Was soll dieser Coach auf keinen Fall tun?',
  },
  {
    id: 44, section: SECTIONS[11], type: 'open',
    prompt: 'Was wäre für dich ein richtig starker Moment in der Zusammenarbeit?',
  },
  {
    id: 45, section: SECTIONS[11], type: 'open',
    prompt: 'Denk an eine Situation, in der Feedback oder ein Rat dich eher blockiert als weitergebracht hat. Was genau hat das ausgelöst?',
  },

  // ─── 13. Kontext ───────────────────────────────────────────
  {
    id: 46, section: SECTIONS[12], type: 'single',
    prompt: 'Was beschreibt deine aktuelle berufliche Rolle am besten?',
    options: [
      { value: 'angestellt_ohne', label: 'Angestellt ohne Führungsverantwortung' },
      { value: 'angestellt_mit', label: 'Angestellt mit Führungsverantwortung' },
      { value: 'unternehmer', label: 'Selbstständig / Unternehmer' },
      { value: 'freiberufler', label: 'Freiberufler / Berater' },
      { value: 'sonstiges', label: 'Sonstiges' },
    ],
  },
  {
    id: 47, section: SECTIONS[12], type: 'single',
    prompt: 'Wenn du Verantwortung für andere trägst – in welchem Rahmen?',
    options: [
      { value: 'niemand', label: 'Ich führe niemanden' },
      { value: '1_5', label: '1–5 Personen' },
      { value: '6_50', label: '6–50 Personen' },
      { value: 'ueber_50', label: 'Über 50 Personen' },
    ],
  },
  {
    id: 48, section: SECTIONS[12], type: 'single',
    prompt: 'Wie viele Jahre Berufserfahrung hast du ungefähr?',
    options: [
      { value: 'unter_5', label: 'Unter 5 Jahre' },
      { value: '5_15', label: '5–15 Jahre' },
      { value: '15_25', label: '15–25 Jahre' },
      { value: 'ueber_25', label: 'Über 25 Jahre' },
    ],
  },
  {
    id: 49, section: SECTIONS[12], type: 'single',
    prompt: 'In welchem Bereich liegt dein größter Handlungsdruck gerade?',
    options: [
      { value: 'beruflich', label: 'Berufliche Entwicklung' },
      { value: 'fuehrung_team', label: 'Führung / Team' },
      { value: 'selbstorga', label: 'Selbstorganisation / Fokus' },
      { value: 'balance', label: 'Lebensbalance / Energie' },
      { value: 'orientierung', label: 'Orientierung / Sinn' },
    ],
  },
  {
    id: 50, section: SECTIONS[12], type: 'single',
    prompt: 'Wie viel Zeit und Energie kannst du realistisch in diesen Prozess investieren?',
    options: [
      { value: 'wenig', label: 'Ich habe gerade wenig Kapazität – es muss effizient sein' },
      { value: 'mittel', label: 'Ich habe mittlere Kapazität – ich kann regelmäßig dran bleiben' },
      { value: 'viel', label: 'Ich habe bewusst Raum dafür geschaffen' },
    ],
  },
]

export const TOTAL_QUESTIONS = QUESTIONS.length

// ─── Zwei-Stufen-Architektur (Briefing 17.07.2026) ─────────────
// Teil 1 = kostenloser Scan (22 Fragen), Teil 2 = nach 149€-Kauf (28 Fragen).
// Die interne 1–50-Nummerierung bleibt erhalten — alle Prompts hängen daran.
// Verteilung exakt aus dem Briefing (Abschnitt 0.1):
//   Teil 1 = 1–4, 8–15, 19–24, 36–37, 47, 49
//   Teil 2 = 5–7, 16–18, 25–35, 38–46, 48, 50
export const TEIL1_IDS: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 19, 20, 21, 22, 23, 24, 36, 37, 47, 49,
])
export const TEIL2_IDS: ReadonlySet<number> = new Set(
  QUESTIONS.map(q => q.id).filter(id => !TEIL1_IDS.has(id)),
)

/** Teil (1|2), zu dem eine Frage gehört. */
export function partOf(id: number): 1 | 2 {
  return TEIL1_IDS.has(id) ? 1 : 2
}

/** Fragen eines Teils in Dateireihenfolge (= interne Nummerierung). */
export function questionsForPart(part: 1 | 2): Question[] {
  return QUESTIONS.filter(q => partOf(q.id) === part)
}

export const TOTAL_TEIL1 = TEIL1_IDS.size // 22
export const TOTAL_TEIL2 = TEIL2_IDS.size // 28

/**
 * Pflicht-Einstieg von Teil 2: Vertiefung zur Teil-1-Antwort auf Frage 4.
 * Die wörtliche Kernformulierung der Q4-Antwort wird eingesetzt; die Antwort
 * zählt als Nachfrage-Antwort (höchste Priorität) und wird als Nachfrage-Teil
 * von answers["4"] gespeichert ("hauptantwort | vertiefungsantwort").
 */
export const VERTIEFUNG_Q4_FRAGE =
  'Was ist der Teil davon, den du dir selbst gegenüber noch nicht ganz zugegeben hast?'

export function vertiefungQ4Prompt(q4Answer: string): string {
  const zitat = (q4Answer ?? '').split(/\s*\|\s*/)[0].trim()
  return `Du hast vorhin gesagt: „${zitat}". ${VERTIEFUNG_Q4_FRAGE}`
}

/**
 * IDs jener Fragen, an denen V3-Doc eine feste Nachfrage vorsieht.
 * Quelle der Wahrheit: das `followUp`-Feld in QUESTIONS — diese Liste ist
 * nur eine convenience-Konstante für UI/Tests.
 */
export const FOLLOWUP_QUESTION_IDS: ReadonlyArray<number> = QUESTIONS
  .filter(q => Boolean(q.followUp))
  .map(q => q.id)

export function questionById(id: number): Question | undefined {
  return QUESTIONS.find(q => q.id === id)
}

/**
 * Eine Antwort kann das Format "Hauptantwort | Nachfrage-Antwort" haben
 * (siehe QuestionnaireFlow). Im Scan-Output werden beide getrennt
 * ausgewiesen, damit der Profiler die Vorrang-Hierarchie korrekt
 * anwenden kann (Nachfrage-Antworten haben höchste Priorität).
 */
export function answersToScanText(
  answers: Record<string, string>,
  opts?: { part?: 1 | 2 },
): string {
  const ids = opts?.part === 1 ? TEIL1_IDS : opts?.part === 2 ? TEIL2_IDS : null
  return QUESTIONS
    .filter(q => !ids || ids.has(q.id))
    .map(q => {
      const raw = answers[String(q.id)]
      if (!raw) return null
      const [main, follow] = raw.split(/\s*\|\s*/)
      let mainText = main
      if (q.type === 'single' && q.options) {
        const opt = q.options.find(o => o.value === main)
        if (opt) mainText = opt.label
      }
      const sectionPart = `[${q.section}]`
      const lines = [`Q${q.id} ${sectionPart} ${q.prompt}`, `A: ${mainText}`]
      if (follow && q.followUp) {
        lines.push(`NACHFRAGE: ${q.followUp}`)
        lines.push(`A: ${follow}`)
      }
      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
