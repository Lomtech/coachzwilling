import Link from 'next/link'
import { notFound } from 'next/navigation'
import { serviceClient } from '@/lib/supabase/service'
import { isHiddenUserId } from '@/lib/admin/hidden-users'
import { QUESTIONS, type Question } from '@/data/questionnaire'
import { MEMORY_SECTION_LABELS } from '@/lib/coach/prompts'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Hidden-User-Check: direkter URL-Aufruf für versteckte Accounts → 404
  if (await isHiddenUserId(id)) notFound()
  const supa = serviceClient()

  const [{ data: profile }, { data: responses }, { data: memories }, { data: coachProfiles }, { data: conversations }] =
    await Promise.all([
      supa.from('profiles').select('*').eq('id', id).maybeSingle(),
      supa.from('questionnaire_responses').select('id, answers, completed_at, created_at').eq('user_id', id).order('created_at', { ascending: false }),
      supa.from('coach_memory').select('id, section, observation, importance, created_at, is_active').eq('user_id', id).order('created_at', { ascending: false }),
      supa.from('coach_profiles').select('id, version, source, model, generated_at, memories_used_count, config_md, is_active').eq('user_id', id).order('version', { ascending: false }),
      supa.from('conversations').select('id, title, updated_at').eq('user_id', id).order('updated_at', { ascending: false }).limit(20),
    ])

  if (!profile) notFound()

  const latestResponse = responses?.[0]
  const answers = (latestResponse?.answers ?? {}) as Record<string, string>

  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">← Alle User</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">{profile.full_name || profile.email}</h1>
        <p className="text-sm text-[var(--color-ink-2)]">{profile.email}</p>
      </div>

      {/* Profile */}
      <section className="card mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Coach-Profile ({coachProfiles?.length ?? 0} Version{coachProfiles?.length === 1 ? '' : 'en'})
        </h2>
        {(coachProfiles ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Noch keine Profile generiert.</p>
        ) : (
          <div className="space-y-3">
            {coachProfiles!.map(cp => (
              <details key={cp.id} className="border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-2)]">
                <summary className="cursor-pointer px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">v{cp.version}</span>
                    {cp.is_active && <span className="chip text-xs">aktiv</span>}
                    <span className="text-xs text-[var(--color-muted)]">{cp.source} · {cp.model}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                    <span>{cp.memories_used_count} Memories</span>
                    <span>{new Date(cp.generated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    <Link href={`/admin/profiles/${cp.id}`} className="text-[var(--color-accent)] hover:underline font-medium">
                      öffnen →
                    </Link>
                    <Link href={`/admin/compare?a=${cp.id}`} className="text-[var(--color-accent)] hover:underline">
                      vergleichen
                    </Link>
                  </div>
                </summary>
                <div className="px-4 pb-4 pt-2">
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--color-ink)] max-h-[600px] overflow-y-auto bg-white p-3 rounded-lg border border-[var(--color-border)]">
                    {cp.config_md}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Memory */}
      <section className="card mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Living Memory ({memories?.filter(m => m.is_active).length ?? 0} aktiv, {memories?.length ?? 0} total)
        </h2>
        {(memories ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Noch keine Memory-Einträge.</p>
        ) : (
          <MemoryBySection memories={memories ?? []} />
        )}
      </section>

      {/* Conversations */}
      <section className="card mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Conversations ({conversations?.length ?? 0})
        </h2>
        {(conversations ?? []).length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Noch keine Chats.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {conversations!.map(c => (
              <li key={c.id} className="flex justify-between gap-3 py-1.5 border-b border-[var(--color-border)] last:border-0">
                <span className="truncate">{c.title ?? '(ohne Titel)'}</span>
                <span className="text-xs text-[var(--color-muted)] shrink-0">
                  {new Date(c.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Onboarding Antworten */}
      <section className="card">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">
          Onboarding-Antworten (50 Fragen)
        </h2>
        {!latestResponse ? (
          <p className="text-sm text-[var(--color-muted)]">Noch keinen Fragebogen ausgefüllt.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-sm text-[var(--color-accent)]">
              ▸ Antworten anzeigen ({Object.keys(answers).length}/42)
            </summary>
            <div className="mt-4 space-y-3">
              {QUESTIONS.map(q => (
                <AnswerRow key={q.id} q={q} a={answers[String(q.id)] ?? null} />
              ))}
            </div>
          </details>
        )}
      </section>
    </>
  )
}

function AnswerRow({ q, a }: { q: Question; a: string | null }) {
  let display = a ?? '(nicht beantwortet)'
  if (a && q.type === 'single' && q.options) {
    const opt = q.options.find(o => o.value === a)
    if (opt) display = `${opt.label} (${a})`
  }
  return (
    <div className="text-xs border-l-2 border-[var(--color-border)] pl-3">
      <div className="text-[var(--color-muted)]">Q{q.id} · {q.section}</div>
      <div className="text-[var(--color-ink-2)] mt-0.5">{q.prompt}</div>
      <div className={`mt-1 ${a ? 'text-[var(--color-ink)]' : 'text-[var(--color-muted)] italic'}`}>
        → {display}
      </div>
    </div>
  )
}

function MemoryBySection({ memories }: { memories: Array<{ id: string; section: string; observation: string; importance: number; created_at: string; is_active: boolean }> }) {
  const grouped = new Map<string, typeof memories>()
  for (const m of memories) {
    if (!m.is_active) continue
    if (!grouped.has(m.section)) grouped.set(m.section, [])
    grouped.get(m.section)!.push(m)
  }
  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([section, items]) => (
        <div key={section}>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
            {MEMORY_SECTION_LABELS[section] ?? section} ({items.length})
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--color-ink-2)]">
            {items.map(m => (
              <li key={m.id} className="flex items-start gap-2">
                <span className="text-xs text-[var(--color-muted)] tabular-nums w-8 shrink-0 pt-0.5">{m.importance}/10</span>
                <span>{m.observation}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
