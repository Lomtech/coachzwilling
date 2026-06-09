import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isOrgAdmin } from '@/lib/org/auth'
import {
  loadOrgStressAggregate,
  loadOrgStressTrend,
  SECTION_RENDER_ORDER,
  SECTION_DESCRIPTIONS,
  formatIntensity,
  intensityBucket,
  type SectionAggregate,
  type SectionTrend,
  type SectionKey,
} from '@/lib/org/aggregates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────────────────────
// HR-Dashboard für Unternehmenskunden
//
// Was der GF/HR-Verantwortliche hier sieht:
//   • Pro Living-Memory-Sektion ein Tile mit aggregierter Intensität
//     (% der Mitarbeitenden mit aktivem Signal in den letzten 30 Tagen)
//   • Trend gegen Vormonat (delta)
//   • Statisches Sektion-Label + Tooltip-Beschreibung
//
// Was der GF/HR NICHT sieht:
//   • Keine Namen, keine E-Mails, keine User-IDs
//   • Keine Klartext-Observations aus coach_memory
//   • Wenn die Org unter dem K-Anonymitäts-Threshold liegt (default 5
//     Mitarbeitende): nur ein Suppression-Hinweis, gar keine Zahlen.
//
// Sichtbarkeit dieser Seite: nur hr_admin oder owner der Org (Check unten).
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ window?: string; threshold?: string }>
}

export default async function OrgDashboardPage({ params, searchParams }: PageProps) {
  const { id: orgId } = await params
  const sp = (await searchParams) ?? {}

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/org/${orgId}/dashboard`)

  const allowed = await isOrgAdmin(orgId)
  // Privacy-bewusst: 404 statt 403 — die Existenz der Org nicht leaken.
  if (!allowed) notFound()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, k_anonymity_threshold, industry')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) notFound()

  const windowDays = clampInt(sp.window, 30, 7, 90)
  const threshold = clampInt(sp.threshold, 7, 5, 10)

  const [aggregates, trends] = await Promise.all([
    loadOrgStressAggregate(orgId, { windowDays, signalThreshold: threshold }),
    loadOrgStressTrend(orgId, { windowDays, signalThreshold: threshold }),
  ])

  const trendBySection = new Map(trends.map(t => [t.section as SectionKey, t]))
  const aggBySection = new Map(aggregates.map(a => [a.section as SectionKey, a]))

  const firstAgg = aggregates[0]
  const totalMembers = firstAgg?.total_members ?? 0
  const suppressed = firstAgg?.suppressed ?? true

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-1">
              HR-Dashboard · anonymisiert
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{org.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/org/${org.id}/manage`} className="btn btn-ghost text-sm">Verwalten</Link>
            <Link href="/org" className="btn btn-ghost text-sm">← Orgs</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Header-Stats */}
        <section className="card p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Aktive Coach-Nutzer" value={`${totalMembers}`} />
            <Stat
              label="K-Anonymitäts-Schwelle"
              value={`≥ ${org.k_anonymity_threshold}`}
              hint="Mindestanzahl Mitarbeitende, damit Zahlen sichtbar sind"
            />
            <Stat label="Zeitfenster" value={`${windowDays} Tage`} />
            <Stat
              label="Signal-Stärke"
              value={`≥ ${threshold} / 10`}
              hint="Nur Memory-Einträge mit dieser Wichtigkeit zählen"
            />
          </div>
        </section>

        {suppressed && (
          <div className="card p-5 mb-6 border-l-4 border-l-[var(--color-warning)] bg-[var(--color-accent-soft)]/20">
            <h2 className="font-semibold mb-1">Zu wenig Daten für anonyme Auswertung</h2>
            <p className="text-sm text-[var(--color-ink-2)]">
              Für eine k-anonyme Auswertung sind mindestens{' '}
              <strong>{org.k_anonymity_threshold} aktive Mitarbeitende</strong>{' '}
              mit Coach-Profil nötig. Aktuell: <strong>{totalMembers}</strong>. Sobald
              weitere Mitarbeitende ihr Onboarding abgeschlossen haben, erscheinen die
              Aggregate hier automatisch.
            </p>
          </div>
        )}

        {/* 9-Sektionen-Heatmap */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Stress- &amp; Verhaltens-Signale</h2>
            <span className="text-xs text-[var(--color-muted)]">
              9 Sektionen · k-anonym aggregiert
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SECTION_RENDER_ORDER.map(section => {
              const agg = aggBySection.get(section)
              const trend = trendBySection.get(section)
              return (
                <SectionTile
                  key={section}
                  section={section}
                  agg={agg}
                  trend={trend}
                />
              )
            })}
          </div>
        </section>

        {/* Datenschutz-Hinweis */}
        <section className="mt-8 text-xs text-[var(--color-muted)] leading-relaxed">
          <strong className="text-[var(--color-ink-2)]">Datenschutz:</strong>{' '}
          Dieses Dashboard zeigt ausschließlich aggregierte Counts pro Sektion. Keine
          Namen, keine Gesprächsinhalte, keine individuell zuordenbaren Daten. Aggregate
          werden nur berechnet, wenn die Org mindestens {org.k_anonymity_threshold}{' '}
          aktive Mitarbeitende hat. HR-Admins und Owner zählen selbst nicht im
          Aggregat mit.
        </section>
      </main>
    </div>
  )
}

function clampInt(v: string | undefined, def: number, min: number, max: number): number {
  if (!v) return def
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)] mb-0.5">{label}</div>
      <div className="text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{hint}</div>}
    </div>
  )
}

function SectionTile({
  section,
  agg,
  trend,
}: {
  section: SectionKey
  agg: SectionAggregate | undefined
  trend: SectionTrend | undefined
}) {
  const intensity = agg?.intensity_index ?? null
  const bucket = intensityBucket(intensity)
  const delta = trend?.delta ?? null

  const bucketStyle: Record<ReturnType<typeof intensityBucket>, string> = {
    ruhig:     'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
    leicht:    'bg-[#f7f3e7] text-[#8a6d10]',
    erhoeht:   'bg-[#fbe9c8] text-[#a06b00]',
    stark:     'bg-[#fbd7d7] text-[#8d1f1f]',
    unbekannt: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
  }

  const bucketLabel: Record<ReturnType<typeof intensityBucket>, string> = {
    ruhig:     'ruhig',
    leicht:    'leicht erhöht',
    erhoeht:   'erhöht',
    stark:     'stark erhöht',
    unbekannt: '—',
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-xs text-[var(--color-muted)] mb-0.5">Sektion</div>
          <h3 className="font-semibold text-sm leading-snug">{agg?.section_label ?? section}</h3>
        </div>
        <span className={'shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ' + bucketStyle[bucket]}>
          {bucketLabel[bucket]}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mt-3">
        <div className="text-2xl font-semibold tabular-nums">{formatIntensity(intensity)}</div>
        {delta !== null && (
          <DeltaBadge delta={delta} />
        )}
      </div>

      <div className="mt-1 text-[11px] text-[var(--color-muted)]">
        {agg?.suppressed
          ? 'unter k-Schwelle'
          : agg
            ? `${agg.members_with_signal ?? 0} von ${agg.total_members} Mitarbeitenden`
            : '—'}
      </div>

      <p className="mt-3 text-xs text-[var(--color-ink-2)] leading-snug">
        {SECTION_DESCRIPTIONS[section]}
      </p>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  // delta in 0..1, also 0.05 = +5pp gegen Vormonat
  const pp = Math.round(delta * 100)
  if (pp === 0) {
    return <span className="text-xs text-[var(--color-muted)]">±0 pp</span>
  }
  const up = pp > 0
  return (
    <span
      className={
        'text-xs font-medium ' +
        (up ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')
      }
      title="Veränderung gegenüber der gleichlangen Vorperiode (in Prozentpunkten)"
    >
      {up ? '▲' : '▼'} {Math.abs(pp)} pp
    </span>
  )
}
