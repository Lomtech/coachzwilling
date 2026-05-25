import 'server-only'

/**
 * Code-seitige Notbremse für Coach-Wiederholungen.
 *
 * Hintergrund: Das System-Prompt-Pattern "Repetition-Awareness" reicht
 * nicht immer — wir haben es in Echtwelt-Chats erlebt, dass der Coach
 * 4-5x exakt dieselbe Antwort wiederholt hat trotz Instruktion.
 *
 * Diese Funktion vergleicht die neue Coach-Antwort gegen die letzten
 * N Assistant-Antworten in der Conversation und entscheidet ob ein
 * Retry sinnvoll ist.
 *
 * Strategie: Normalisierte Whitespace + Casefold + Char-Vergleich.
 * Levenshtein wäre genauer aber teurer — für unsere Use-Cases reicht
 * eine "ist im Wesentlichen das Gleiche"-Heuristik.
 */

const REPETITION_WINDOW = 3 // wie viele vorherige Coach-Antworten vergleichen
const SIMILARITY_THRESHOLD = 0.85 // 0–1; >= heißt "ist eine Wiederholung"

export interface RepetitionResult {
  isRepetition: boolean
  matchedPriorIndex?: number   // welcher Index in der Historie der Treffer war (0 = letzter)
  similarity?: number
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:—–-]/g, '')
    .trim()
}

/**
 * Simple character-shingle-based similarity (Jaccard auf 4-grams).
 * Schnell, deterministisch, gut genug für "ist das die gleiche Antwort?".
 */
function shingleSimilarity(a: string, b: string, k = 4): number {
  if (a.length === 0 || b.length === 0) return 0
  if (a === b) return 1

  const shinglesA = new Set<string>()
  const shinglesB = new Set<string>()
  for (let i = 0; i <= a.length - k; i++) shinglesA.add(a.slice(i, i + k))
  for (let i = 0; i <= b.length - k; i++) shinglesB.add(b.slice(i, i + k))

  if (shinglesA.size === 0 || shinglesB.size === 0) {
    // Strings kürzer als k → fall back to exact match
    return a === b ? 1 : 0
  }

  let intersect = 0
  for (const s of shinglesA) if (shinglesB.has(s)) intersect++
  const union = shinglesA.size + shinglesB.size - intersect
  return intersect / union
}

export function detectRepetition(args: {
  newReply: string
  recentAssistantReplies: string[]   // chronologisch, neueste zuletzt
}): RepetitionResult {
  const newNorm = normalize(args.newReply)
  if (newNorm.length < 10) return { isRepetition: false } // zu kurz für sinnvollen Vergleich

  const recent = args.recentAssistantReplies.slice(-REPETITION_WINDOW)
  for (let i = recent.length - 1; i >= 0; i--) {
    const priorNorm = normalize(recent[i])
    if (priorNorm.length < 10) continue
    const sim = shingleSimilarity(newNorm, priorNorm)
    if (sim >= SIMILARITY_THRESHOLD) {
      return {
        isRepetition: true,
        matchedPriorIndex: recent.length - 1 - i,
        similarity: sim,
      }
    }
  }
  return { isRepetition: false }
}

/**
 * Korrektur-Hinweis der bei Repetition als Suffix an die User-Message
 * angehängt wird beim Retry. Bewusst direkt, kurz, mit Pattern-Break-Anweisung.
 */
export function buildRepetitionCorrection(): string {
  return `\n\n[SYSTEM-KORREKTUR — nicht sichtbar für den User: Du hast gerade fast wortgleich wiederholt was du in einem deiner letzten 1-3 Turns schon gesagt hast. PATTERN-BREAK: gib jetzt eine komplett andere Antwort. Wähle EINEN der folgenden Wege:
  (a) benenne den Hänger offen ("Ich hänge gerade in einer Schleife — sorry. ...") und stell eine ANDERE Frage,
  (b) wechsle das Thema komplett wenn der User dir schon Signale gegeben hat dass er was anderes will,
  (c) verarbeite die User-Antwort statt sie wieder zu hinterfragen ("OK, X also — was bedeutet das für dich?").
Verbote für diesen Turn: keine erneute Variation der gleichen Frage. Keine weitere Wiederholung. Wenn du nochmal hängst, ist das ein klarer Stil-Bruch.]`
}

/**
 * Erkennt das Deflection-Pattern: Coach beantwortet die neue User-Frage nicht,
 * sondern lenkt mit "Erst: ..." / "Zuerst: ..." / "Das kommt gleich. Erst: ..."
 * zurück auf ein altes Thema. Trigger nur wenn die User-Message tatsächlich
 * substantiell wirkt (>= 30 Zeichen oder Fragezeichen).
 */
export interface DeflectionResult {
  isDeflection: boolean
  matchedPrefix?: string
}

const DEFLECTION_PREFIXES = [
  /^erst:\s*/i,
  /^zuerst:?\s+/i,
  /^bevor\s+(wir|du)\s+/i,
  /^halt,?\s*(zu)?erst:?\s+/i,
  /^stop,?\s*(zu)?erst:?\s+/i,
  /^das kommt gleich\.?\s*(zu)?erst:?\s+/i,
  /^das machen wir gleich\.?\s*(zu)?erst:?\s+/i,
  /^einen moment\.?\s*(zu)?erst:?\s+/i,
]

export function detectDeflection(args: {
  coachReply: string
  userMessage: string
}): DeflectionResult {
  const reply = args.coachReply.trim()
  const userMsg = args.userMessage.trim()

  // User-Frage muss substantiell wirken, sonst greifen wir nicht
  const userIsSubstantive = userMsg.length >= 30 || /\?\s*$/.test(userMsg)
  if (!userIsSubstantive) return { isDeflection: false }

  // Erste 1-2 Zeilen der Coach-Antwort gegen Prefix-Liste prüfen
  const firstChunk = reply.split('\n').slice(0, 2).join(' ').slice(0, 120)
  for (const rx of DEFLECTION_PREFIXES) {
    const m = firstChunk.match(rx)
    if (m) {
      return { isDeflection: true, matchedPrefix: m[0].trim() }
    }
  }
  return { isDeflection: false }
}

export function buildDeflectionCorrection(): string {
  return `\n\n[SYSTEM-KORREKTUR — nicht sichtbar für den User: Du hast die Frage des Users gerade NICHT beantwortet — sondern mit "Erst: ..." / "Zuerst: ..." / "Das kommt gleich. Erst: ..." zurück auf ein altes Thema gelenkt. Das ist Deflection und VERBOTEN. Beantworte JETZT die ursprüngliche Frage des Users substanziell. Wenn du noch einen offenen Punkt hast (z. B. Bewerbungen), darfst du den am ENDE deiner Antwort kurz erwähnen — aber NIEMALS als Vorbedingung verwenden. Der User entscheidet die Agenda, nicht du.]`
}
