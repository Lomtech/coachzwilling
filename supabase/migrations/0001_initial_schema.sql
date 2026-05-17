-- ─────────────────────────────────────────────────────────────────────────────
-- fuehrungs-coach — initial schema
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── profiles ────────────────────────────────────────────────────────────────
-- 1:1 zu auth.users; via trigger angelegt.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- onboarding state machine: 'pending' | 'questionnaire' | 'profiled' | 'active'
  onboarding_state text not null default 'pending'
);

create index profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── questionnaire_responses ────────────────────────────────────────────────
-- Roh-Antworten der 42 Scan-Fragen. JSONB, eine Zeile pro abgeschlossenem Scan.
create table public.questionnaire_responses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  answers      jsonb not null,           -- { "1": "...", "2": "...", ..., "42": "..." }
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index questionnaire_responses_user_idx on public.questionnaire_responses (user_id, created_at desc);

alter table public.questionnaire_responses enable row level security;

create policy "qr_self_read"   on public.questionnaire_responses
  for select using (auth.uid() = user_id);
create policy "qr_self_insert" on public.questionnaire_responses
  for insert with check (auth.uid() = user_id);
create policy "qr_self_update" on public.questionnaire_responses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── coach_profiles ─────────────────────────────────────────────────────────
-- Generiertes Coach-Profil (Markdown) — wird vom Profiler-LLM erzeugt
-- und dient dem Coach als System-Prompt + Cache-Anker.
create table public.coach_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  source_response_id    uuid references public.questionnaire_responses (id) on delete set null,
  config_md             text not null,
  ton_profil_md         text,
  einstiegsmodus_md     text,
  model                 text not null,        -- z.B. "claude-opus-4-7"
  generated_at          timestamptz not null default now(),
  is_active             boolean not null default true,
  unique (user_id, generated_at)
);

create index coach_profiles_user_active_idx
  on public.coach_profiles (user_id) where is_active = true;

alter table public.coach_profiles enable row level security;

create policy "cp_self_read"
  on public.coach_profiles for select
  using (auth.uid() = user_id);

-- ─── conversations + messages ───────────────────────────────────────────────
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index conversations_user_idx on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

create policy "conv_self_all"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  -- Token-Telemetrie für Caching-Auswertung
  input_tokens    integer,
  output_tokens   integer,
  cache_read_input_tokens     integer,
  cache_creation_input_tokens integer,
  created_at      timestamptz not null default now()
);

create index messages_conv_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "msg_self_read"
  on public.messages for select using (auth.uid() = user_id);
create policy "msg_self_insert"
  on public.messages for insert with check (auth.uid() = user_id);

-- ─── subscriptions ──────────────────────────────────────────────────────────
-- Mirror der Stripe-Subscription. Webhook hält das hier synchron.
create table public.subscriptions (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id       text not null,
  stripe_subscription_id   text,
  status                   text not null,    -- active | trialing | past_due | canceled | incomplete | unpaid | paused
  price_id                 text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  trial_end                timestamptz,
  updated_at               timestamptz not null default now()
);

create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);
create index subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;

create policy "sub_self_read"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ─── trigger: profile-row beim signup automatisch ──────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── trigger: updated_at touch ──────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger questionnaire_touch
  before update on public.questionnaire_responses
  for each row execute function public.touch_updated_at();

create trigger conversations_touch
  before update on public.conversations
  for each row execute function public.touch_updated_at();

create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();
