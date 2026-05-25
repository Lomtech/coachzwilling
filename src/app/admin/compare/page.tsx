import Link from 'next/link'
import { notFound } from 'next/navigation'
import { serviceClient } from '@/lib/supabase/service'
import { getHiddenUserIds } from '@/lib/admin/hidden-users'

export const dynamic = 'force-dynamic'

interface ProfileWithUser {
  id: string
  version: number
  source: string
  generated_at: string
  config_md: string
  user_id: string
  user_email: string
  user_name: string | null
}

export default async function CompareProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a, b } = await searchParams
  const supa = serviceClient()
  const hiddenIds = await getHiddenUserIds()

  // Alle Profile + alle User separat laden, dann clientseitig joinen — hidden raus
  const [{ data: rows }, { data: users }] = await Promise.all([
    supa.from('coach_profiles')
      .select('id, version, source, generated_at, config_md, user_id')
      .order('generated_at', { ascending: false }),
    supa.from('profiles').select('id, email, full_name'),
  ])

  const userById = new Map((users ?? []).map(u => [u.id, u]))
  const profilesAll: ProfileWithUser[] = (rows ?? [])
    .filter(r => !hiddenIds.has(r.user_id))
    .map(r => {
      const u = userById.get(r.user_id)
      return {
        id: r.id,
        version: r.version,
        source: r.source,
        generated_at: r.generated_at,
        config_md: r.config_md,
        user_id: r.user_id,
        user_email: u?.email ?? '(unbekannt)',
        user_name: u?.full_name ?? null,
      }
    })

  // Direkter URL-Aufruf mit hidden profile-id → 404
  if (a && !profilesAll.find(p => p.id === a)) notFound()
  if (b && !profilesAll.find(p => p.id === b)) notFound()

  const profileA = a ? profilesAll.find(p => p.id === a) : null
  const profileB = b ? profilesAll.find(p => p.id === b) : null

  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">← Übersicht</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Profile vergleichen</h1>
      </div>

      <form method="GET" className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Profil A</label>
          <select name="a" defaultValue={a ?? ''} className="!py-2 !text-sm mt-1">
            <option value="">— wählen —</option>
            {profilesAll.map(p => (
              <option key={p.id} value={p.id}>
                {p.user_name || p.user_email} — v{p.version} ({p.source}) — {fmt(p.generated_at)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Profil B</label>
          <select name="b" defaultValue={b ?? ''} className="!py-2 !text-sm mt-1">
            <option value="">— wählen —</option>
            {profilesAll.map(p => (
              <option key={p.id} value={p.id}>
                {p.user_name || p.user_email} — v{p.version} ({p.source}) — {fmt(p.generated_at)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary md:col-span-2">Vergleichen</button>
      </form>

      {profileA && profileB ? (
        <SideBySide a={profileA} b={profileB} />
      ) : (
        <div className="card text-sm text-[var(--color-muted)] text-center py-10">
          Wähle zwei Profile aus, um den Diff zu sehen.
        </div>
      )}
    </>
  )
}

function SideBySide({ a, b }: { a: ProfileWithUser; b: ProfileWithUser }) {
  const sectionsA = splitSections(a.config_md)
  const sectionsB = splitSections(b.config_md)
  const allKeys = Array.from(new Set([...sectionsA.keys(), ...sectionsB.keys()]))

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4 sticky top-14 z-20 bg-[var(--color-bg)] py-3 -mx-5 px-5 border-b border-[var(--color-border)]">
        <ProfileHeader p={a} label="A" />
        <ProfileHeader p={b} label="B" />
      </div>

      <div className="space-y-6">
        {allKeys.map(key => (
          <div key={key}>
            <h3 className="text-sm font-semibold mb-2 text-[var(--color-ink)] sticky top-32 bg-[var(--color-bg)] py-1 z-10">
              {key}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <SectionBox text={sectionsA.get(key) ?? '(in A nicht vorhanden)'} />
              <SectionBox text={sectionsB.get(key) ?? '(in B nicht vorhanden)'} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function ProfileHeader({ p, label }: { p: ProfileWithUser; label: string }) {
  return (
    <div className="card !p-3">
      <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Profil {label}</div>
      <div className="font-semibold text-sm mt-0.5 truncate">{p.user_name || p.user_email}</div>
      <div className="text-xs text-[var(--color-muted)]">{p.user_email}</div>
      <div className="text-xs text-[var(--color-ink-2)] mt-1">v{p.version} · {p.source} · {fmt(p.generated_at)}</div>
    </div>
  )
}

function SectionBox({ text }: { text: string }) {
  return (
    <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-2)] p-3 max-h-[500px] overflow-y-auto">
      <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--color-ink-2)]">
        {text}
      </pre>
    </div>
  )
}

/** Splittet ein config_md in Map<sectionHeader, content> für sektion-by-sektion-Diff */
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

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
