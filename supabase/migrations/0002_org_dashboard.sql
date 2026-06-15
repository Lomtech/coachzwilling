-- ─────────────────────────────────────────────────────────────────────────────
-- Deepling — B2B Organizations + anonymes HR-Dashboard
--
-- Ziel:
--   Geschäftsführer / HR-Verantwortliche eines Kundenunternehmens sehen
--   aggregierte Stress- und Verhaltensmuster IHRER Mitarbeitenden über die
--   bereits existierenden 9 Living-Memory-Sektionen (motivmuster,
--   stressmuster, ausweich, veraenderung, coaching_stil, identitaet,
--   goal, blocker, breakthrough) — OHNE individuell identifizierbare
--   Daten zu sehen.
--
-- Datenschutz-Architektur (Belt + Braces):
--
--   1. RLS bleibt auf coach_memory unverändert: jeder User sieht NUR seine
--      eigenen Memories. HR-Admins haben KEIN SELECT-Recht auf fremde
--      Memories. Diese RLS ist die erste Verteidigungslinie.
--
--   2. Die Aggregations-RPC `org_stress_aggregate` läuft mit `security
--      definer` und greift dadurch RLS-bypassend auf coach_memory zu — gibt
--      aber AUSSCHLIESSLICH integer-counts pro Sektion zurück. Niemals
--      observation-Text, niemals user_ids. Das ist der einzige Pfad, über
--      den HR-Daten "sieht".
--
--   3. K-Anonymitäts-Schwelle (default 5): wenn ein Tenant weniger als
--      `k_anonymity_threshold` aktive Mitglieder hat, gibt die RPC für
--      alle Sektionen 0 zurück. Verhindert dass man durch fehlende
--      Sektionen Rückschlüsse auf einzelne Personen ziehen kann. Der
--      Schwellwert ist pro Org einstellbar (manche Kunden wollen ihn
--      höher).
--
--   4. Aufruf-Kontroll-Layer (in /lib/org/auth.ts): zusätzlich prüft die
--      Application dass der Aufrufer hr_admin oder owner der Org ist —
--      die RPC selbst hat diesen Check NICHT (sonst könnte man sie nicht
--      einfach testen). Defense in depth.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  -- Mindestanzahl aktiver Mitglieder, damit ein Aggregat überhaupt
  -- zurückgegeben wird. 5 ist der Default — schützt vor 1-Person-
  -- Re-Identifikation in kleinen Teams.
  k_anonymity_threshold    integer not null default 5
    check (k_anonymity_threshold >= 3 and k_anonymity_threshold <= 50),
  -- Sektor / Branche — optional, für die GF-Anzeige + spätere Benchmarks
  industry                 text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index organizations_slug_idx on public.organizations (slug);

create table public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- 'member'    = normale Führungskraft, nutzt Coach, taucht im Aggregat auf
  -- 'hr_admin'  = darf Dashboard sehen, taucht selbst NICHT im Aggregat auf
  --               (verhindert Selbst-Identifikation in 5-Person-Orgs)
  -- 'owner'     = wie hr_admin + darf Members einladen/entfernen
  role       text not null check (role in ('member','hr_admin','owner')),
  joined_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.organization_members (user_id);
create index org_members_role_idx
  on public.organization_members (org_id, role)
  where role in ('hr_admin','owner');

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Eine Org sehen darf jedes Mitglied (für /org-Auswahl im UI).
create policy "org_member_read" on public.organizations
  for select using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = organizations.id
        and om.user_id = auth.uid()
    )
  );

-- Die eigene Mitgliedschaft sehen darf jeder.
create policy "om_self_read" on public.organization_members
  for select using (user_id = auth.uid());

-- HR-Admins/Owner sehen Member-Liste der eigenen Org (für Member-Count im
-- Dashboard-Header — nicht für individuelle Daten).
create policy "om_admin_read" on public.organization_members
  for select using (
    exists (
      select 1 from public.organization_members admin
      where admin.org_id = organization_members.org_id
        and admin.user_id = auth.uid()
        and admin.role in ('hr_admin','owner')
    )
  );

create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();

-- ─── Aggregations-RPC ──────────────────────────────────────────────────────
--
-- Liefert pro Memory-Sektion:
--   • members_with_signal  — Anzahl Mitarbeitende (NUR 'member'-Rolle) mit
--                            mindestens einem Living-Memory-Eintrag der
--                            letzten N Tage, dessen importance >= threshold
--                            in dieser Sektion liegt
--   • total_members        — Gesamtzahl 'member' in der Org
--   • intensity_index      — members_with_signal / total_members (0..1)
--
-- Wenn total_members < org.k_anonymity_threshold → ALLE Zeilen werden mit
-- intensity_index=null / members_with_signal=null zurückgegeben.
-- Die Spalte `suppressed` ist dann true, sonst false.

create or replace function public.org_stress_aggregate(
  p_org_id            uuid,
  p_window_days       integer default 30,
  p_signal_threshold  integer default 7
)
returns table (
  section              text,
  section_label        text,
  members_with_signal  integer,
  total_members        integer,
  intensity_index      numeric,
  suppressed           boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_k_threshold integer;
  v_total       integer;
begin
  -- 0) Defense in depth: Caller muss HR-Admin oder Owner der Org sein.
  --    Der Application-Layer prüft das auch (isOrgAdmin), aber so scheitert
  --    ein direkter REST-Call /rest/v1/rpc/org_stress_aggregate mit fremder
  --    org_id auch DB-seitig — nicht nur in der Next.js-Route.
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('owner','hr_admin')
  ) then
    raise exception 'forbidden — caller is not an org admin' using errcode = '42501';
  end if;

  -- 1) Org existiert? K-Threshold lesen
  select k_anonymity_threshold into v_k_threshold
    from public.organizations where id = p_org_id;
  if v_k_threshold is null then
    raise exception 'organization not found';
  end if;

  -- 2) Aktive Mitarbeitende zählen (NUR 'member'-Rolle, HR-Admins sind raus)
  select count(*)::integer into v_total
    from public.organization_members
    where org_id = p_org_id and role = 'member';

  -- 3) Aggregat mit fester Sektion-Liste joinen, damit auch Sektionen mit 0
  --    Signalen als Zeile rauskommen (UI braucht alle 9 Tiles).
  return query
  with sections(section, section_label) as (
    values
      ('motivmuster',   'Motiv- & Verhaltensmuster'),
      ('stressmuster',  'Stress- & Druckmuster'),
      ('ausweich',      'Ausweich- & Selbsttäuschung'),
      ('veraenderung',  'Veränderungs- & Umsetzungslogik'),
      ('coaching_stil', 'Wirksamer Coaching-Stil'),
      ('identitaet',    'Selbstbild & Identität'),
      ('goal',          'Aktuelle Ziele & Vorhaben'),
      ('blocker',       'Aktuelle Blocker'),
      ('breakthrough',  'Durchbrüche & Aha-Momente')
  ),
  members as (
    select user_id from public.organization_members
    where org_id = p_org_id and role = 'member'
  ),
  signals as (
    -- distinct user pro section mit mind. einem high-importance memory
    -- innerhalb des Zeitfensters
    select distinct cm.user_id, cm.section
    from public.coach_memory cm
    inner join members m on m.user_id = cm.user_id
    where cm.is_active = true
      and cm.importance >= p_signal_threshold
      and cm.created_at > now() - make_interval(days => p_window_days)
  ),
  counts as (
    select s.section, s.section_label, count(distinct sig.user_id)::integer as members_with_signal
    from sections s
    left join signals sig on sig.section = s.section
    group by s.section, s.section_label
  )
  select
    c.section,
    c.section_label,
    case when v_total < v_k_threshold then null else c.members_with_signal end as members_with_signal,
    v_total as total_members,
    case
      when v_total < v_k_threshold then null
      when v_total = 0             then 0::numeric
      else round(c.members_with_signal::numeric / v_total, 3)
    end as intensity_index,
    v_total < v_k_threshold as suppressed
  from counts c
  order by c.section;
end;
$$;

-- Authenticated-Rolle darf die RPC aufrufen, der Application-Layer prüft
-- zusätzlich dass der Aufrufer ein HR-Admin der Ziel-Org ist (siehe
-- src/lib/org/auth.ts → isOrgAdmin). Anon explizit raus — `revoke from
-- public` reicht nicht, anon hat separate default-grants.
revoke all on function public.org_stress_aggregate(uuid, integer, integer) from public;
revoke execute on function public.org_stress_aggregate(uuid, integer, integer) from anon;
grant execute on function public.org_stress_aggregate(uuid, integer, integer) to authenticated;

-- Convenience-RPC: aktuelle vs. Baseline-Periode für Trend-Anzeige.
-- Gibt für jede Sektion (intensity_now, intensity_prev) zurück.
create or replace function public.org_stress_trend(
  p_org_id            uuid,
  p_window_days       integer default 30,
  p_signal_threshold  integer default 7
)
returns table (
  section          text,
  section_label    text,
  intensity_now    numeric,
  intensity_prev   numeric,
  delta            numeric,
  suppressed       boolean
)
language sql
security definer
set search_path = public
as $$
  with now_agg as (
    select section, intensity_index, suppressed
    from public.org_stress_aggregate(p_org_id, p_window_days, p_signal_threshold)
  ),
  prev_agg as (
    -- Vor-Periode: gleiches Zeitfenster, um p_window_days verschoben
    select section, intensity_index
    from public.org_stress_aggregate(p_org_id, p_window_days * 2, p_signal_threshold)
  )
  select
    n.section,
    -- Labels muss erneut materialisiert werden, da prev_agg nur intensity hat
    case n.section
      when 'motivmuster'   then 'Motiv- & Verhaltensmuster'
      when 'stressmuster'  then 'Stress- & Druckmuster'
      when 'ausweich'      then 'Ausweich- & Selbsttäuschung'
      when 'veraenderung'  then 'Veränderungs- & Umsetzungslogik'
      when 'coaching_stil' then 'Wirksamer Coaching-Stil'
      when 'identitaet'    then 'Selbstbild & Identität'
      when 'goal'          then 'Aktuelle Ziele & Vorhaben'
      when 'blocker'       then 'Aktuelle Blocker'
      when 'breakthrough'  then 'Durchbrüche & Aha-Momente'
      else n.section
    end as section_label,
    n.intensity_index as intensity_now,
    p.intensity_index as intensity_prev,
    case
      when n.suppressed then null
      when n.intensity_index is null or p.intensity_index is null then null
      else round(n.intensity_index - p.intensity_index, 3)
    end as delta,
    n.suppressed
  from now_agg n
  left join prev_agg p on p.section = n.section
  order by n.section;
$$;

revoke all on function public.org_stress_trend(uuid, integer, integer) from public;
revoke execute on function public.org_stress_trend(uuid, integer, integer) from anon;
grant execute on function public.org_stress_trend(uuid, integer, integer) to authenticated;

-- Tabellen-Exposure: anon soll die Org-Tabellen nicht via PostgREST/GraphQL
-- discovern können. RLS wäre die zweite Schicht, aber wir wollen die OBJEKTE
-- gar nicht erst sichtbar machen.
revoke select on public.organizations from anon;
revoke select on public.organization_members from anon;
