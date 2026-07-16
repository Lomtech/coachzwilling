import 'server-only'
import { anthropic, PROFILER_MODEL } from '@/lib/claude/client'
import { serviceClient } from '@/lib/supabase/service'
import { renderDeepSpaceHtml, type DeepSpaceDoc, type DeepSpaceVariant } from './deepspace-html'

/**
 * Transformiert das interne Rohprofil (coach_profiles.config_md, Deep Space V5,
 * Abschnitte A1–A9) in die strukturierte DeepSpaceDoc fürs Kundendokument.
 *
 * Warum ein LLM-Transform statt Markdown-Parsing: config_md ist Freitext-
 * Markdown; ein Parser wäre brüchig (Abschnitts-Varianten, Bullet-Formen).
 * Der LLM extrahiert robust die 2 Kernmuster (A1), den blinden Fleck (A5/A6),
 * formuliert die Ich-Sätze für Titel-Quote + „eigene Worte" und leitet Rolle +
 * Chips aus dem Profil ab. Er erfindet NICHTS dazu (strikte Prompt-Vorgabe).
 *
 * Strukturierte Ausgabe über ein erzwungenes Tool (tool_choice) → validiertes
 * JSON, kein Parsing/Retry im Call-Site nötig.
 */

const DOC_TOOL = {
  name: 'deepspace_doc',
  description: 'Strukturierter Inhalt für das Deep-Space-Kundendokument, abgeleitet aus dem internen Rohprofil.',
  input_schema: {
    type: 'object' as const,
    properties: {
      role: {
        type: 'string',
        description: 'Kurze Rolle/Kontext-Zeile, z.B. "Partner · IT-Strategieberatung" oder "Führungskraft · Entwicklung". Aus dem Profil ableiten; wenn Rolle unklar, thematisch statt erfunden.',
      },
      pullQuote: {
        type: 'string',
        description: 'EIN Ich-Satz (Du/Ich-Form) für die Titelseite, der die zentrale Spannung des Profils auf den Punkt bringt — abgeleitet aus dem Profil, nicht generisch. Kein Fragezeichen. 1–2 Sätze.',
      },
      chips: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 4,
        description: 'Kurze Pills. Immer dabei: das Leitthema aus A2 Motivstruktur (z.B. "Orientierung / Sinn", "Klarheit / Freiheit") und das Jahr "2026". 1–2 weitere nur wenn am Profil belegbar (Erfahrung, Führungsspanne) — sonst thematisch.',
      },
      kernmuster: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        description: 'Die Kernmuster aus A1 als Stärke/Kehrseite-Paare — in Du-Form umformuliert, prägnant.',
        items: {
          type: 'object',
          properties: {
            staerke: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Pointierte Überschrift der Stärke, Du-Form.' },
                body: { type: 'string', description: '2–3 Sätze, Du-Form, konkret.' },
              },
              required: ['title', 'body'],
            },
            kehrseite: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Pointierte Überschrift der Kehrseite, Du-Form.' },
                body: { type: 'string', description: '2–3 Sätze, Du-Form, konkret.' },
              },
              required: ['title', 'body'],
            },
          },
          required: ['staerke', 'kehrseite'],
        },
      },
      blinderFleck: {
        type: 'object',
        description: 'Aus A5 (blinder Fleck) + A6 (Entscheidungsleck).',
        properties: {
          wasDuWillst: { type: 'string', description: 'Was die Person bewusst will — Du-Form, 1–2 Sätze.' },
          wasPassiert: { type: 'string', description: 'Was sie stattdessen tut / vermeidet — Du-Form, 1–2 Sätze.' },
          eigeneWorte: { type: 'string', description: 'Der zugespitzte Ich/Du-Satz für die dunkle "Aus deinen eigenen Worten"-Box — die unbequeme Wahrheit hinter dem Muster.' },
        },
        required: ['wasDuWillst', 'wasPassiert', 'eigeneWorte'],
      },
      schatten: {
        type: 'object',
        description: 'NUR für die volle Variante: ein Schatten aus A4 (Du-Form). Bei Mini weglassen erlaubt.',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title', 'body'],
      },
      orientierung: {
        type: 'string',
        description: 'NUR für die volle Variante: die 90-Tage-Orientierung aus A8, in 1–2 Sätzen zusammengefasst (Du-Form). Bei Mini weglassen erlaubt.',
      },
    },
    required: ['role', 'pullQuote', 'chips', 'kernmuster', 'blinderFleck'],
  },
}

const SYSTEM = `Du bist Redakteur für Deepling. Du bekommst Rohmaterial über eine Person und wandelst es in den Inhalt für ein kundenseitiges Vorschau-Dokument.

Strenge Regeln:
- Nutze ausschließlich, was im Rohmaterial steht/erkennbar ist. Erfinde KEINE Fakten, keine Zahlen, keine Biografie dazu.
- Schreib in Du-Form, präzise, unaufgeregt. Kein Coaching-Sprech, keine Floskeln, keine Listen im Fließtext.
- Kernmuster als Stärke/Kehrseite-Paare; blinder Fleck als „was du willst" / „was passiert" plus ein zugespitzter „eigene Worte"-Satz.
- pullQuote und eigeneWorte sind pointierte Ich/Du-Sätze, die die zentrale Spannung treffen — im Ton der Person.
- Gib das Ergebnis ausschließlich über das Tool "deepspace_doc" zurück.`

interface BuildOpts {
  name: string
  /** 'full' liefert zusätzlich schatten + orientierung. */
  variant: 'mini' | 'full'
  /**
   * 'profile' (default): Input ist ein volles config_md (A1–A9).
   * 'scan': Input sind nur kurze Mini-Scan-Antworten → vorsichtig ableiten,
   *   keine Ferndiagnose behaupten.
   */
  kind?: 'profile' | 'scan'
}

/** Ein einzelner LLM-Versuch. `reinforce` verschärft die Vollständigkeits-Vorgabe. */
async function attemptDeepSpaceDoc(source: string, opts: BuildOpts, reinforce: boolean): Promise<DeepSpaceDoc> {
  const kind = opts.kind ?? 'profile'
  const sourceNote = kind === 'scan'
    ? `Rohmaterial: KURZE Scan-Antworten (nur wenige Antworten, KEIN volles Profil). Leite vorsichtig 2 plausible Kernmuster (Stärke/Kehrseite) + 1 blinden Fleck ab — es ist eine kostenlose Vorschau, keine Ferndiagnose. Nicht übertreiben; bleib nah an den Worten. schatten/orientierung weglassen.`
    : `Rohmaterial: internes Rohprofil (config_md, Abschnitte A1–A9). Kernmuster aus A1, blinder Fleck aus A5 + A6.${opts.variant === 'full' ? ' Für die VOLLE Variante zusätzlich schatten (A4) + orientierung (A8) mitliefern.' : ''}`

  const reinforceNote = reinforce
    ? '\n\nWICHTIG: pullQuote, JEDES Kernmuster (Stärke UND Kehrseite, je title + body) und der blinderFleck (wasDuWillst, wasPassiert, eigeneWorte) MÜSSEN gefüllt sein. Lass KEIN Feld leer — leite notfalls sinngemäß aus dem Rohmaterial ab.'
    : ''

  const userMsg = `Vorname der Person (für die Titelseite): ${opts.name || 'Unbekannt'}
Dokument-Variante: ${opts.variant === 'full' ? 'VOLL' : 'MINI-Vorschau'}
${sourceNote}${reinforceNote}

── Rohmaterial ──
${source}`

  const res = await anthropic().messages.create({
    model: PROFILER_MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools: [DOC_TOOL],
    tool_choice: { type: 'tool', name: 'deepspace_doc' },
    messages: [{ role: 'user', content: userMsg }],
  })

  const block = res.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new Error('deepspace: kein tool_use-Block in der LLM-Antwort')
  }
  const raw = block.input as Partial<DeepSpaceDoc>

  // Defensiv normalisieren + Namen aus der DB gewinnt (Titelseite).
  const doc: DeepSpaceDoc = {
    name: opts.name || raw.name || 'Profil',
    role: raw.role || '—',
    pullQuote: raw.pullQuote || '',
    chips: Array.isArray(raw.chips) ? raw.chips.filter(Boolean).slice(0, 4) : [],
    kernmuster: Array.isArray(raw.kernmuster) ? raw.kernmuster.filter(k => k?.staerke && k?.kehrseite) : [],
    blinderFleck: {
      wasDuWillst: raw.blinderFleck?.wasDuWillst || '',
      wasPassiert: raw.blinderFleck?.wasPassiert || '',
      eigeneWorte: raw.blinderFleck?.eigeneWorte || '',
    },
    ...(raw.schatten?.title ? { schatten: raw.schatten } : {}),
    ...(raw.orientierung ? { orientierung: raw.orientierung } : {}),
  }
  return doc
}

const _ne = (s?: string) => !!s && s.trim().length > 0

/** Sind alle kundenrelevanten Pflichtfelder gefüllt? Sonst gäbe es z.B. ein
 *  leeres „"-Zitat im PDF (beobachtet: LLM lässt blinderFleck gelegentlich leer). */
export function isDeepSpaceDocComplete(doc: DeepSpaceDoc): boolean {
  return _ne(doc.pullQuote)
    && doc.kernmuster.length >= 1
    && doc.kernmuster.every(k =>
        _ne(k.staerke?.title) && _ne(k.staerke?.body) && _ne(k.kehrseite?.title) && _ne(k.kehrseite?.body))
    && _ne(doc.blinderFleck.wasDuWillst)
    && _ne(doc.blinderFleck.wasPassiert)
    && _ne(doc.blinderFleck.eigeneWorte)
}

/**
 * Baut das Deep-Space-Dokument robust: ist der erste Versuch unvollständig
 * (LLM-Nicht-Determinismus lässt v.a. blinderFleck manchmal leer → leeres „"
 * im Kundendokument), wird EINMAL mit verstärktem Hinweis nachgelegt und der
 * vollständigere behalten.
 */
export async function buildDeepSpaceDoc(source: string, opts: BuildOpts): Promise<DeepSpaceDoc> {
  const first = await attemptDeepSpaceDoc(source, opts, false)
  if (isDeepSpaceDocComplete(first)) return first
  try {
    const second = await attemptDeepSpaceDoc(source, opts, true)
    if (isDeepSpaceDocComplete(second)) return second
    // Beide unvollständig → den mit mehr gefüllten Kernfeldern nehmen.
    const filled = (d: DeepSpaceDoc) =>
      [d.pullQuote, d.blinderFleck.wasDuWillst, d.blinderFleck.wasPassiert, d.blinderFleck.eigeneWorte]
        .filter(s => s?.trim()).length
    return filled(second) >= filled(first) ? second : first
  } catch {
    return first
  }
}

/**
 * Lädt ein Coach-Profil, transformiert dessen config_md ins Deep-Space-Dokument
 * (mit Cache in coach_profiles.deepspace_json pro Variante) und rendert das HTML.
 * Geteilt von der Admin-Route und der Dev-Vorschau. KEIN Auth hier — der
 * Aufrufer muss absichern.
 */
export async function loadAndRenderDeepSpace(
  profileId: string,
  variant: DeepSpaceVariant,
  opts?: { refresh?: boolean; appUrl?: string; ctaUrl?: string },
): Promise<{ html: string } | { error: string; status: number }> {
  const supa = serviceClient()
  const { data: cp } = await supa
    .from('coach_profiles')
    .select('config_md, deepspace_json, user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!cp?.config_md) return { error: 'Profil nicht gefunden', status: 404 }

  const { data: prof } = await supa
    .from('profiles')
    .select('full_name')
    .eq('id', cp.user_id)
    .maybeSingle()
  // Titelseite zeigt nur den Vornamen (wie im Muster: „Markus").
  const name = (prof?.full_name ?? '').trim().split(/\s+/)[0] || 'Profil'

  const cache = (cp.deepspace_json && typeof cp.deepspace_json === 'object' && !Array.isArray(cp.deepspace_json)
    ? cp.deepspace_json
    : {}) as unknown as Record<string, DeepSpaceDoc>

  let doc: DeepSpaceDoc | undefined = opts?.refresh ? undefined : cache[variant]
  if (!doc) {
    doc = await buildDeepSpaceDoc(cp.config_md, { name, variant })
    // Cache pro Variante — aber NUR wenn vollständig. Sonst würde ein leeres/
    // kaputtes Doc dauerhaft hängenbleiben (best-effort; Render klappt auch bei
    // Schreib-Fehler).
    if (isDeepSpaceDocComplete(doc)) {
      try {
        await supa
          .from('coach_profiles')
          .update({
            deepspace_json: { ...cache, [variant]: doc } as unknown as never,
            deepspace_generated_at: new Date().toISOString(),
          })
          .eq('id', profileId)
      } catch (e) {
        console.error('[deepspace] cache write failed', e)
      }
    }
  }

  const html = renderDeepSpaceHtml(doc, {
    variant,
    appUrl: opts?.appUrl ?? (process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de'),
    price: '49 €',
    ctaUrl: opts?.ctaUrl,
  })
  return { html }
}
