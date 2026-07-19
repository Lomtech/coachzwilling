-- 0005_unlock_codes.sql
-- Einzel-Freischalt-Codes für die Vollanalyse (Alternative zum 149-€-Kauf).
--
-- Der Coach erzeugt pro Klient einen einmal einlösbaren Code; einlösen setzt
-- profiles.full_unlocked=true (schaltet Teil 2 + Vollprofil frei, gratis).
-- Nachverfolgbar: label (welcher Klient), redeemed_by/redeemed_at.
--
-- Abgrenzung: NICHT zu verwechseln mit org_activation_codes (B2B-Seats/Org-
-- Mitgliedschaft) — die schalten die Vollanalyse NICHT frei.

create table if not exists public.unlock_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                       -- immer UPPERCASE gespeichert
  label        text,                                       -- Klient/Notiz, frei
  created_by   uuid references auth.users(id) on delete set null,
  redeemed_by  uuid references auth.users(id) on delete set null,
  redeemed_at  timestamptz,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table public.unlock_codes is
  'Einmal einlösbare Freischalt-Codes für die Vollanalyse (setzt profiles.full_unlocked). Coach-Ausgabe pro Klient.';

-- Nur Service-Role (Admin-Routen) und die SECURITY-DEFINER-Funktion unten dürfen
-- ran — keine RLS-Policies = für normale User komplett dicht.
alter table public.unlock_codes enable row level security;
alter table public.unlock_codes force row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Atomarer Einlöse-RPC. Sperrt die Code-Zeile (FOR UPDATE) gegen Doppel-Einlösung,
-- prüft aktiv + unbenutzt, markiert sie und setzt das Entitlement in EINER TX.
-- Gibt {ok, error?, already?} zurück (JSON, gespiegelt vom org-redeem-Stil).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.redeem_unlock_code(p_code text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.unlock_codes%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_code
    from public.unlock_codes
    where code = upper(trim(p_code))
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'code-not-found');
  end if;

  if not v_code.active then
    return jsonb_build_object('ok', false, 'error', 'code-inactive');
  end if;

  if v_code.redeemed_by is not null then
    -- Idempotent: derselbe User hat ihn schon eingelöst → weiterhin ok.
    if v_code.redeemed_by = p_user_id then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'code-used');
  end if;

  update public.unlock_codes
    set redeemed_by = p_user_id, redeemed_at = now()
    where id = v_code.id;

  update public.profiles
    set full_unlocked = true, full_unlocked_at = now()
    where id = p_user_id;

  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

comment on function public.redeem_unlock_code(text, uuid) is
  'Löst einen unlock_code atomar ein und setzt profiles.full_unlocked=true. Aufruf nur serverseitig (Service-Role) mit der Session-User-ID.';
