import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type OrgRole = 'member' | 'hr_admin' | 'owner'

export interface OrgMembership {
  org_id: string
  org_name: string
  org_slug: string
  role: OrgRole
}

/**
 * Lädt alle Org-Mitgliedschaften des aktuellen Users.
 * Liefert leere Liste wenn nicht eingeloggt.
 */
export async function listMyOrgs(): Promise<OrgMembership[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organizations!inner(id, name, slug)')
    .eq('user_id', user.id)

  if (error || !data) return []
  return data.map(r => {
    const org = r.organizations as unknown as { id: string; name: string; slug: string }
    return {
      org_id: org.id,
      org_name: org.name,
      org_slug: org.slug,
      role: r.role as OrgRole,
    }
  })
}

/**
 * Prüft ob der aktuelle User HR-Admin oder Owner der angegebenen Org ist.
 * Wirft NICHT — gibt nur boolean zurück. Aufrufer-Routen entscheiden selbst,
 * ob sie 403 oder 404 antworten (404 ist privacy-freundlicher, weil es
 * die Existenz der Org nicht leakt).
 */
export async function isOrgAdmin(orgId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'hr_admin' || data.role === 'owner'
}
