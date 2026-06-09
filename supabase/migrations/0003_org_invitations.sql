-- ─────────────────────────────────────────────────────────────────────────────
-- Coaching-Zwilling — Organisations-Einladungen
--
-- Workflow:
--   1. Owner/HR-Admin der Org legt via /org/[id]/manage eine Invitation an
--      → Row in org_invitations mit unique token (24 bytes base64url)
--      → Email an Adressat mit Link /invite/<token>
--   2. Adressat klickt Link, ist eingeloggt (oder loggt sich ein/registriert sich)
--      → POST /api/invite/accept übernimmt: Insert in organization_members,
--        Mark Invitation accepted_at + accepted_by
--   3. Pending Invitations laufen nach 14 Tagen aus (expires_at-Check
--      in der Accept-Route + im UI-Filter)
--
-- Wer darf was?
--   • Invitations sehen: Org-Owner/HR-Admin (für Manage-UI) + der Eingeladene
--     selbst (zur Token-Validierung). RLS deckt nur den ersten Fall ab —
--     die Token-Validierung läuft über die /api/invite/accept-Route mit
--     Service-Client, weil der eingeladene User ja noch nicht in der Org
--     drin ist und damit die RLS-Policy nicht greift.
--   • Invitations anlegen/widerrufen: nur Owner/HR-Admin (in der Route geprüft).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.org_invitations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('member', 'hr_admin')),
  -- 24 zufällige Bytes als base64url — wird vom Application-Layer erzeugt
  token           text not null unique,
  invited_by      uuid not null references public.profiles (id) on delete cascade,
  invited_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '14 days'),
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz
);

create index org_invitations_org_idx
  on public.org_invitations (org_id)
  where accepted_at is null and revoked_at is null;

create index org_invitations_email_idx
  on public.org_invitations (lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.org_invitations enable row level security;

-- Owner/HR-Admin der jeweiligen Org sehen alle Invitations.
create policy "inv_admin_read" on public.org_invitations
  for select using (
    exists (
      select 1 from public.organization_members om
      where om.org_id = org_invitations.org_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'hr_admin')
    )
  );

-- Schreiben (Insert/Update/Delete) läuft über die API-Routes mit
-- Service-Client — keine direkten Client-Schreibrechte.
