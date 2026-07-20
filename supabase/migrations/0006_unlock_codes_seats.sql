-- 0006_unlock_codes_seats.sql
-- Freischalt-Codes bekommen PLÄTZE: ein Code kann von N Personen eingelöst werden.
--
-- Warum: Der Coach verkauft Firmen-Pakete („eure 10 Mitarbeiter, 3000 €"). Statt
-- 10 Einzel-Codes zu verteilen gibt es EINEN Firmencode mit 10 Plätzen. Der
-- Einzel-Klienten-Fall bleibt derselbe Mechanismus mit max_seats = 1.
--
-- unlock_codes.redeemed_by/redeemed_at fallen weg — wer eingelöst hat steht ab
-- jetzt in unlock_code_redemptions (eine Wahrheit, mehrere Einlöser möglich).
-- Gefahrlos, weil die Tabelle produktiv noch leer ist.

alter table public.unlock_codes
  add column if not exists max_seats  int not null default 1,
  add column if not exists used_seats int not null default 0;

alter table public.unlock_codes
  drop column if exists redeemed_by,
  drop column if exists redeemed_at;

alter table public.unlock_codes
  add constraint unlock_codes_seats_sane check (max_seats >= 1 and used_seats >= 0 and used_seats <= max_seats);

comment on column public.unlock_codes.max_seats is 'Wie viele Personen diesen Code einlösen dürfen. 1 = Einzel-Klient, N = Firmenpaket.';

create table if not exists public.unlock_code_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references public.unlock_codes(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id)   -- derselbe Mensch verbraucht nie zwei Plätze
);

comment on table public.unlock_code_redemptions is
  'Wer hat welchen Freischalt-Code eingelöst. unique(code_id,user_id) verhindert Doppelverbrauch eines Platzes.';

alter table public.unlock_code_redemptions enable row level security;
alter table public.unlock_code_redemptions force row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Einlöse-RPC neu: platzbasiert, weiterhin atomar (FOR UPDATE auf dem Code).
-- Rückgabe {ok, error?, already?, seats_left?}.
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

  -- Dieser Mensch hat den Code schon eingelöst → idempotent, kein zweiter Platz.
  -- Entitlement sicherheitshalber (nach)setzen, falls es mal verloren ging.
  if exists (
    select 1 from public.unlock_code_redemptions
    where code_id = v_code.id and user_id = p_user_id
  ) then
    update public.profiles
      set full_unlocked = true,
          full_unlocked_at = coalesce(full_unlocked_at, now())
      where id = p_user_id;
    return jsonb_build_object('ok', true, 'already', true,
                              'seats_left', v_code.max_seats - v_code.used_seats);
  end if;

  if v_code.used_seats >= v_code.max_seats then
    return jsonb_build_object('ok', false, 'error', 'code-full');
  end if;

  insert into public.unlock_code_redemptions (code_id, user_id)
    values (v_code.id, p_user_id);

  update public.unlock_codes
    set used_seats = used_seats + 1
    where id = v_code.id;

  update public.profiles
    set full_unlocked = true, full_unlocked_at = now()
    where id = p_user_id;

  return jsonb_build_object('ok', true, 'already', false,
                            'seats_left', v_code.max_seats - (v_code.used_seats + 1));
end;
$$;

comment on function public.redeem_unlock_code(text, uuid) is
  'Löst einen Freischalt-Code platzbasiert + atomar ein und setzt profiles.full_unlocked. Nur serverseitig aufrufen (Service-Role) mit der Session-User-ID.';
