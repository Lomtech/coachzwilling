// Deep Profiling — Coaching-Zwilling (Denkhorizonte)
// Scan-Modus: eine Frage nach der anderen, keine Nachfragen, keine Bewertung.

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
  '10. Sinn des Coaching-Zwillings',
  '11. Grenzen',
  '12. Kontext',
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
    helper: 'Stell dir vor, der Coaching-GPT verändert in 6 Monaten drei zentrale Dinge in deinem Verhalten. Wie reagierst du innerlich?',
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

  // ─── 10. Sinn des Coaching-Zwillings ───────────────────────
  {
    id: 32, section: SECTIONS[9], type: 'open',
    prompt: 'Warum willst du diesen Coaching-Zwilling nutzen – wirklich?',
  },
  {
    id: 33, section: SECTIONS[9], type: 'open',
    prompt: 'Woran würdest du erkennen, dass er dir hilft?',
  },
  {
    id: 34, section: SECTIONS[9], type: 'open',
    prompt: 'Wovor soll er dich im besten Fall bewahren?',
  },

  // ─── 11. Grenzen ───────────────────────────────────────────
  {
    id: 35, section: SECTIONS[10], type: 'open',
    prompt: 'Was soll dieser Coach auf keinen Fall tun?',
  },
  {
    id: 36, section: SECTIONS[10], type: 'open',
    prompt: 'Was wäre für dich ein richtig starker Moment in der Zusammenarbeit?',
  },
  {
    id: 37, section: SECTIONS[10], type: 'open',
    prompt: 'Denk an eine Situation, in der Feedback oder ein Rat dich eher blockiert als weitergebracht hat. Was genau hat das ausgelöst?',
  },

  // ─── 12. Kontext ───────────────────────────────────────────
  {
    id: 38, section: SECTIONS[11], type: 'single',
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
    id: 39, section: SECTIONS[11], type: 'single',
    prompt: 'Wenn du Verantwortung für andere trägst – in welchem Rahmen?',
    options: [
      { value: 'niemand', label: 'Ich führe niemanden' },
      { value: '1_5', label: '1–5 Personen' },
      { value: '6_50', label: '6–50 Personen' },
      { value: 'ueber_50', label: 'Über 50 Personen' },
    ],
  },
  {
    id: 40, section: SECTIONS[11], type: 'single',
    prompt: 'Wie viele Jahre Berufserfahrung hast du ungefähr?',
    options: [
      { value: 'unter_5', label: 'Unter 5 Jahre' },
      { value: '5_15', label: '5–15 Jahre' },
      { value: '15_25', label: '15–25 Jahre' },
      { value: 'ueber_25', label: 'Über 25 Jahre' },
    ],
  },
  {
    id: 41, section: SECTIONS[11], type: 'single',
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
    id: 42, section: SECTIONS[11], type: 'single',
    prompt: 'Wie viel Zeit und Energie kannst du realistisch in diesen Prozess investieren?',
    options: [
      { value: 'wenig', label: 'Ich habe gerade wenig Kapazität – es muss effizient sein' },
      { value: 'mittel', label: 'Ich habe mittlere Kapazität – ich kann regelmäßig dran bleiben' },
      { value: 'viel', label: 'Ich habe bewusst Raum dafür geschaffen' },
    ],
  },
]

export const TOTAL_QUESTIONS = QUESTIONS.length

export function questionById(id: number): Question | undefined {
  return QUESTIONS.find(q => q.id === id)
}

export function answersToScanText(answers: Record<string, string>): string {
  return QUESTIONS
    .map(q => {
      const raw = answers[String(q.id)]
      if (!raw) return null
      let answerText = raw
      if (q.type === 'single' && q.options) {
        const opt = q.options.find(o => o.value === raw)
        if (opt) answerText = opt.label
      }
      const sectionPart = `[${q.section}]`
      return `Q${q.id} ${sectionPart} ${q.prompt}\nA: ${answerText}`
    })
    .filter(Boolean)
    .join('\n\n')
}
