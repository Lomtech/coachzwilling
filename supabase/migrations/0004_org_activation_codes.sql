-- ─────────────────────────────────────────────────────────────────────────────
-- Deepling — B2B Activation Codes (Bulk-Codes statt Per-User-Invitations)
--
-- Use Case:
--   Chef einer Firma kauft 6 Zugänge bei Lom/Michael, bekommt EINEN Code wie
--   "DEEPLING-ACME-7B3K" + Link (https://deepling.com/join/DEEPLING-ACME-7B3K),
--   leitet ihn an seine Mitarbeitenden weiter. Mitarbeiter registriert sich
--   → Code wird gegen `org_activation_codes` validiert → User landet automatisch
--   als `member` der Organization, Coach-Gate erlaubt durch ohne Stripe-Sub.
--
-- Unterschied zu `org_invitations` (Migration 0003):
--   • org_invitations:    1 Invitation = 1 Mail = 1 User. Chef muss pro
--                          Mitarbeiter eine E-Mail-Adresse haben.
--   • org_activation_codes: 1 Code = N Seats. Chef gibt EINEN Code raus,
--                            jeder Mitarbeiter löst ihn ein, max_seats greift
--                            als hard cap.
--
-- Wer erstellt Codes:
--   Lom/Michael (admin) via direkten SQL-Insert oder das Admin-UI.
--   Spätere Self-Service-Variante: Chef erstellt selbst Codes für seine Org
--   (out of scope für jetzt).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.org_activation_codes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  -- Lesbarer Code für Mensch-Sharing: z.B. "DEEPLING-ACME-7B3K".
  -- Buchstaben+Zahlen, Bindestriche erlaubt, case-insensitive über lower().
  code        text not null,
  max_seats   integer not null check (max_seats > 0),
  -- Counter wird bei jedem successful redeem incrementiert. Atomicity via
  -- redeem_activation_code() RPC unten.
  used_seats  integer not null default 0 check (used_seats >= 0),
  -- Optional: Ablaufdatum. NULL = kein Ablauf.
  expires_at  timestamptz,
  -- Soft-disable ohne Löschen (z.B. wenn Chef Code kompromittiert hat).
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Eindeutig: ein Code-String darf nur einmal existieren (case-insensitive).
create unique index org_activation_codes_code_uniq
  on public.org_activation_codes (lower(code));

create index org_activation_codes_org_idx
  on public.org_activation_codes (org_id);

alter table public.org_activation_codes enable row level security;

-- RLS: Org-Admin/Owner sehen Codes der eigenen Org (für Counter im
-- Dashboard "5 von 6 Plätzen belegt"). Normale Member sehen keine Codes.
create policy "oac_admin_read" on public.org_activation_codes
  for select using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = org_activation_codes.org_id
        and om.user_id = auth.uid()
        and om.role in ('hr_admin','owner')
    )
  );

-- ─── RPC: redeem_activation_code ────────────────────────────────────────────
-- Atomicity: max_seats darf nie überschritten werden, auch nicht bei
-- konkurrierenden Redeems. Mit security definer + lock auf der code-Row.
--
-- Returns: org_id wenn erfolgreich, NULL wenn Code ungültig / voll / inaktiv /
-- abgelaufen / User bereits Member.
create or replace function public.redeem_activation_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_code_row  record;
begin
  if v_uid is null then
    return null;
  end if;

  -- Code suchen + Row-Lock (FOR UPDATE), damit zwei konkurrierende Redeems
  -- nicht beide den letzten Seat schnappen.
  select id, org_id, max_seats, used_seats, expires_at, active
    into v_code_row
    from public.org_activation_codes
   where lower(code) = lower(p_code)
   for update;

  -- Code existiert nicht
  if v_code_row.id is null then
    return null;
  end if;

  -- Code inaktiv oder abgelaufen
  if not v_code_row.active then
    return null;
  end if;
  if v_code_row.expires_at is not null and v_code_row.expires_at < now() then
    return null;
  end if;

  -- User bereits Member dieser Org? Dann kein neuer Seat, einfach Org-id
  -- zurückgeben (idempotenter Aufruf).
  if exists (
    select 1 from public.organization_members
    where org_id = v_code_row.org_id and user_id = v_uid
  ) then
    return v_code_row.org_id;
  end if;

  -- Seats voll
  if v_code_row.used_seats >= v_code_row.max_seats then
    return null;
  end if;

  -- Membership eintragen + Seat-Counter erhöhen
  insert into public.organization_members (org_id, user_id, role)
  values (v_code_row.org_id, v_uid, 'member');

  update public.org_activation_codes
     set used_seats = used_seats + 1
   where id = v_code_row.id;

  return v_code_row.org_id;
end;
$$;

revoke all on function public.redeem_activation_code(text) from public;
grant execute on function public.redeem_activation_code(text) to authenticated;

-- ─── Optional Helper: Code aus Org-Name generieren ──────────────────────────
-- Format: DEEPLING-<UPPER(SLUG ohne Sonderzeichen, max 12 chars)>-<4-char-Hex>
-- Aufruf in SQL: select generate_activation_code('acme-coaching');
-- → "DEEPLING-ACMECOACHIN-A3F8"
create or replace function public.generate_activation_code(p_slug_hint text)
returns text
language plpgsql
as $$
declare
  v_slug_part text;
  v_random    text;
begin
  v_slug_part := upper(regexp_replace(coalesce(p_slug_hint, 'ORG'), '[^A-Za-z0-9]', '', 'g'));
  v_slug_part := substr(v_slug_part, 1, 12);
  v_random    := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  return 'DEEPLING-' || v_slug_part || '-' || v_random;
end;
$$;
