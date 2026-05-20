import 'server-only'
import { serviceClient } from '@/lib/supabase/service'
import { refineCoachProfile } from '@/lib/coach/profiler'

export const AUTO_REFRESH_THRESHOLD = 20 // alle 20 neuen Memory-Einträge

export interface RefineResult {
  newProfileId: string
  version: number
  memoriesUsed: number
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Refresht das aktive Coach-Profil eines Users mit allen aktiven Memories.
 * Idempotent — kann manuell oder automatisch aufgerufen werden.
 * Returnt null wenn kein aktives Profil existiert oder keine Memories vorhanden.
 */
export async function refineProfileForUser(args: {
  userId: string
  source: 'manual_refresh' | 'auto_refresh'
}): Promise<RefineResult | null> {
  const supa = serviceClient()

  // 1) Aktives Profil holen
  const { data: oldProfile } = await supa
    .from('coach_profiles')
    .select('id, config_md, version, source_response_id')
    .eq('user_id', args.userId)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!oldProfile) {
    console.warn('[refine] kein aktives Profil für', args.userId)
    return null
  }

  // 2) Alle aktiven Memories
  const { data: memories } = await supa
    .from('coach_memory')
    .select('section, observation, importance')
    .eq('user_id', args.userId)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })

  const memList = (memories ?? []).map(m => ({
    section: m.section,
    observation: m.observation,
    importance: m.importance,
  }))

  if (memList.length === 0) {
    console.warn('[refine] keine Memories für', args.userId, '- skip')
    return null
  }

  // 3) Refine-Call
  const result = await refineCoachProfile({
    oldConfigMd: oldProfile.config_md,
    memories: memList,
  })

  // 4) Nächste Version berechnen (RPC not in TS-Types, daher cast)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: versionRow } = await (supa as any).rpc('next_profile_version', { p_user_id: args.userId })
  const nextVersion = (typeof versionRow === 'number' ? versionRow : null) ?? (oldProfile.version + 1)

  // 5) Altes Profil deaktivieren + neues aktivieren
  await supa
    .from('coach_profiles')
    .update({ is_active: false })
    .eq('user_id', args.userId)
    .eq('is_active', true)

  const { data: inserted, error } = await supa
    .from('coach_profiles')
    .insert({
      user_id: args.userId,
      source_response_id: oldProfile.source_response_id,
      config_md: result.configMd,
      tone_oneliner: result.toneOneliner,
      language_mirror: result.languageMirror,
      model: result.model,
      is_active: true,
      version: nextVersion,
      source: args.source,
      memories_used_count: memList.length,
    })
    .select('id, version')
    .single()

  if (error || !inserted) {
    console.error('[refine] insert failed', error)
    return null
  }

  return {
    newProfileId: inserted.id,
    version: inserted.version,
    memoriesUsed: memList.length,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  }
}

/**
 * Auto-Trigger: prüft ob seit letztem Refresh ≥ N neue Memory-Einträge
 * dazugekommen sind. Wenn ja → ruft refineProfileForUser auf.
 * Wird nach jedem extracted Memory-Eintrag im Chat-Endpoint aufgerufen.
 */
export async function maybeAutoRefresh(userId: string): Promise<RefineResult | null> {
  const supa = serviceClient()

  const [{ data: profile }, { count }] = await Promise.all([
    supa.from('coach_profiles')
      .select('memories_used_count')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supa.from('coach_memory')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true),
  ])

  if (!profile || count === null) return null

  const delta = count - profile.memories_used_count
  if (delta < AUTO_REFRESH_THRESHOLD) return null

  return refineProfileForUser({ userId, source: 'auto_refresh' })
}
