import Link from 'next/link'
import { notFound } from 'next/navigation'
import { serviceClient } from '@/lib/supabase/service'
import { isHiddenUserId } from '@/lib/admin/hidden-users'

export const dynamic = 'force-dynamic'

export default async function AdminProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supa = serviceClient()

  const { data: profile } = await supa
    .from('coach_profiles')
    .select('id, user_id, version, source, generated_at, model, memories_used_count, config_md, is_active, source_response_id')
    .eq('id', id)
    .maybeSingle()

  if (!profile) notFound()
  // Profile von hidden Users: nicht anzeigbar
  if (await isHiddenUserId(profile.user_id)) notFound()

  const [{ data: user }, { data: otherVersions }, { data: response }] = await Promise.all([
    supa.from('profiles').select('email, full_name').eq('id', profile.user_id).maybeSingle(),
    supa.from('coach_profiles')
      .select('id, version, source, generated_at, is_active')
      .eq('user_id', profile.user_id)
      .order('version', { ascending: false }),
    profile.source_response_id
      ? supa.from('questionnaire_responses').select('completed_at, answers').eq('id', profile.source_response_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const userLabel = user?.full_name || user?.email || '(unbekannt)'
  const sections = splitSections(profile.config_md)

  return (
    <>
      {/* Breadcrumb */}
      <div className="text-xs text-[var(--color-muted)] mb-2">
        <Link href="/admin" className="hover:text-[var(--color-ink)]">Admin</Link>
        {' › '}
        <Link href={`/admin/users/${profile.user_id}`} className="hover:text-[var(--color-ink)]">{userLabel}</Link>
        {' › '}
        <span>Profil v{profile.version}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Profil v{profile.version}
            {profile.is_active && <span className="chip ml-3 text-xs align-middle">aktiv</span>}
          </h1>
          <p className="text-sm text-[var(--color-ink-2)] mt-1">
            {userLabel} · {profile.source} · {profile.model} ·{' '}
            {new Date(profile.generated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            {' · '}
            {profile.memories_used_count} Memories
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={`/admin/profiles/${profile.id}/deepspace?variant=mini`}
            target="_blank"
            rel="noopener"
            className="btn btn-primary text-xs px-3 py-1.5"
            title="Deep-Space-Kundendokument (Vorschau mit Paywall). Öffnet im neuen Tab → Cmd/Strg+P → als PDF speichern."
          >
            ✦ Deep-Space PDF · Vorschau
          </a>
          <a
            href={`/admin/profiles/${profile.id}/deepspace?variant=full`}
            target="_blank"
            rel="noopener"
            className="btn btn-secondary text-xs px-3 py-1.5"
            title="Vollständiges Rohprofil im Deep-Space-Design (ohne Paywall)."
          >
            Vollständig
          </a>
          <Link
            href={`/admin/compare?a=${profile.id}`}
            className="btn btn-secondary text-xs px-3 py-1.5"
          >
            ⇆ Vergleichen
          </Link>
          <CopyButton md={profile.config_md} />
        </div>
      </div>

      {/* Andere Versionen — Quick-Switcher */}
      {(otherVersions ?? []).length > 1 && (
        <div className="card mb-4 !p-3">
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
            Alle Versionen für {userLabel}
          </div>
          <div className="flex gap-2 flex-wrap">
            {otherVersions!.map(v => (
              <Link
                key={v.id}
                href={`/admin/profiles/${v.id}`}
                className={
                  'text-xs px-3 py-1 rounded-full ' +
                  (v.id === profile.id
                    ? 'bg-[var(--color-ink)] text-white'
                    : 'bg-[var(--color-surface-2)] hover:bg-[var(--color-border)]')
                }
              >
                v{v.version} · {v.source}
                {v.is_active && v.id !== profile.id && <span className="ml-1 opacity-60">(aktiv)</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sektionen rendered einzeln (kein Markdown-Renderer, nur klar formatiert) */}
      <div className="space-y-4">
        {Array.from(sections.entries()).map(([title, content]) => (
          <section key={title} className="card">
            <h2 className="font-semibold text-[var(--color-ink)] mb-3 text-base">{title}</h2>
            <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-[var(--color-ink-2)]">
              {content}
            </pre>
          </section>
        ))}
      </div>

      {/* Source-Response (Antworten) */}
      {response && (
        <details className="card mt-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--color-ink)]">
            ▸ Source-Antworten anzeigen ({Object.keys((response as { answers: Record<string, string> }).answers ?? {}).length} von 42)
          </summary>
          <pre className="mt-3 text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--color-ink-2)] bg-[var(--color-surface-2)] p-3 rounded-lg max-h-[400px] overflow-y-auto">
            {JSON.stringify((response as { answers: Record<string, string> }).answers, null, 2)}
          </pre>
        </details>
      )}

      <div className="mt-6 text-xs text-[var(--color-muted)] text-center">
        Profil-ID <code className="font-mono">{profile.id}</code> · permanent verlinkbar
      </div>
    </>
  )
}

function splitSections(md: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = md.split('\n')
  let currentKey: string | null = null
  let buffer: string[] = []
  for (const line of lines) {
    if (line.match(/^##\s+/)) {
      if (currentKey !== null) map.set(currentKey, buffer.join('\n').trim())
      currentKey = line.replace(/^##\s+/, '').trim()
      buffer = []
    } else if (currentKey !== null) {
      buffer.push(line)
    }
  }
  if (currentKey !== null) map.set(currentKey, buffer.join('\n').trim())
  return map
}

import { CopyButton } from './CopyButton'
