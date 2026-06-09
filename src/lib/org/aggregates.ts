import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type SectionKey =
  | 'motivmuster' | 'stressmuster' | 'ausweich' | 'veraenderung'
  | 'coaching_stil' | 'identitaet' | 'goal' | 'blocker' | 'breakthrough'

export interface SectionAggregate {
  section: SectionKey
  section_label: string
  members_with_signal: number | null
  total_members: number
  intensity_index: number | null
  suppressed: boolean
}

export interface SectionTrend {
  section: SectionKey
  section_label: string
  intensity_now: number | null
  intensity_prev: number | null
  delta: number | null
  suppressed: boolean
}

/**
 * Reihenfolge fürs UI — fachlich sinnvolle Gruppierung statt alphabetisch:
 * Stressmuster / Blocker / Ausweich zuerst (Akutsignale für HR), dann
 * Veränderung / Goal / Breakthrough (Bewegungssignale), dann die "ruhigen"
 * Sektionen Motiv / Identität / Coaching-Stil.
 */
export const SECTION_RENDER_ORDER: SectionKey[] = [
  'stressmuster', 'blocker', 'ausweich',
  'veraenderung', 'goal', 'breakthrough',
  'motivmuster', 'identitaet', 'coaching_stil',
]

/**
 * Kurzbeschreibung pro Sektion fürs Dashboard (Tooltip / Hover).
 * Bewusst keine individuellen Inhalte — diese Texte sind statisch.
 */
export const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
  motivmuster:
    'Wiederkehrende Motive und Verhaltensmuster, die im Coaching auftauchen.',
  stressmuster:
    'Druck- und Stresssignale: wie Mitarbeitende unter Belastung reagieren.',
  ausweich:
    'Vermeidungs- und Selbsttäuschungsmuster — was nicht angegangen wird.',
  veraenderung:
    'Bereitschaft zu Veränderung und Umsetzung von Erkenntnissen.',
  coaching_stil:
    'Welcher Impuls-Stil im Coaching wirksam ist (konfrontativ / Raum / Rückenwind).',
  identitaet:
    'Selbstbild und Identitäts-Themen, die im Gespräch sichtbar werden.',
  goal:
    'Konkrete Ziele und Vorhaben, an denen aktuell gearbeitet wird.',
  blocker:
    'Aktuelle Hindernisse und ungelöste Spannungen.',
  breakthrough:
    'Aha-Momente und Durchbrüche im Coaching-Prozess.',
}

/**
 * Lädt den k-anonymen 9-Sektionen-Stress-Aggregat für eine Organisation.
 *
 * WICHTIG: ruft NUR die security-definer-RPC auf. Liest nie direkt aus
 * coach_memory. Damit ist garantiert dass nie Klartext-Observations oder
 * user_ids zurückgegeben werden — die RPC liefert nur Counts.
 *
 * Caller MUSS vorher via isOrgAdmin() verifizieren dass der User berechtigt
 * ist (auth.ts/assertOrgAdmin-Pattern). Diese Funktion macht keine
 * Berechtigungsprüfung — sie ist die DB-Schicht.
 */
export async function loadOrgStressAggregate(
  orgId: string,
  opts?: { windowDays?: number; signalThreshold?: number },
): Promise<SectionAggregate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_stress_aggregate', {
    p_org_id: orgId,
    p_window_days: opts?.windowDays ?? 30,
    p_signal_threshold: opts?.signalThreshold ?? 7,
  })
  if (error) {
    console.error('[org] aggregate failed', error)
    return []
  }
  return (data ?? []) as unknown as SectionAggregate[]
}

export async function loadOrgStressTrend(
  orgId: string,
  opts?: { windowDays?: number; signalThreshold?: number },
): Promise<SectionTrend[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('org_stress_trend', {
    p_org_id: orgId,
    p_window_days: opts?.windowDays ?? 30,
    p_signal_threshold: opts?.signalThreshold ?? 7,
  })
  if (error) {
    console.error('[org] trend failed', error)
    return []
  }
  return (data ?? []) as unknown as SectionTrend[]
}

/**
 * Formatiert intensity_index 0..1 als Prozent-String für die UI.
 * null/suppressed → "—"
 */
export function formatIntensity(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return `${Math.round(v * 100)} %`
}

/**
 * Heuristisches Heatmap-Bucket fürs UI:
 *   < 15 %  → ruhig
 *   15-34 % → leicht erhöht
 *   35-59 % → erhöht
 *   ≥ 60 %  → stark erhöht
 */
export function intensityBucket(v: number | null): 'ruhig' | 'leicht' | 'erhoeht' | 'stark' | 'unbekannt' {
  if (v === null || Number.isNaN(v)) return 'unbekannt'
  if (v < 0.15) return 'ruhig'
  if (v < 0.35) return 'leicht'
  if (v < 0.60) return 'erhoeht'
  return 'stark'
}
