# Coaching-Zwilling

Ein KI-Coaching-Zwilling für Führungskräfte, gebaut auf Next.js 16, Supabase, Stripe und Claude.

**Konzept:** User füllt einen 42-Fragen-Scan aus (Denkhorizonte-Methodik). Daraus generiert Claude Opus 4.7 ein individuelles Coach-Profil, das als System-Prompt + Cache-Anker für jeden Coach-Dialog mit Claude Sonnet 4.6 dient.

## Stack

| Layer | Technologie |
|---|---|
| App | Next.js 16.2 (App Router) + React 19 |
| Styling | Tailwind v4, helles Theme, mobile-first |
| Auth + DB | Supabase (Projekt `wlxolfkhkxembiuofmfa`, Region eu-west-2) |
| Zahlungen | Stripe Subscriptions (monatlich + jährlich, 7 Tage Trial) |
| KI | Anthropic SDK — Sonnet 4.6 (Coach), Opus 4.7 (Profiler) |
| Hosting | Vercel `fra1` |

## Routen

| Pfad | Zweck |
|---|---|
| `/` | Landing-Page mit Pricing |
| `/signup` `/login` `/forgot-password` | Auth |
| `/onboarding` | Scan-Intro |
| `/onboarding/start` | Direktstart 1. Frage |
| `/billing` | Plan wählen / aktiv |
| `/billing/success` | Post-Checkout Sync |
| `/coach` | Chat mit Coaching-Zwilling |
| `/coach?c=<id>` | Bestimmte Conversation |
| `/settings` | Konto, Abo, Logout |
| `/api/auth/callback` `/logout` | Supabase Email-Link + Logout |
| `/api/onboarding/save` | Auto-Save während Scan |
| `/api/onboarding/finalize` | Claude Opus erzeugt Profil |
| `/api/chat` | SSE-Stream — Coach-Antwort |
| `/api/stripe/checkout` `/portal` `/webhook` | Stripe |

## Schutz-Logik (`src/proxy.ts`)

- CSRF-Schutz für alle state-mutating API-Routen (außer `/api/stripe/webhook`)
- Auth-Gate für `/coach`, `/onboarding`, `/settings`, `/billing`
- Coach-Gate: `/coach` braucht `onboarding_state ∈ {profiled, active}` **und** Subscription `status ∈ {active, trialing}`

## Datenmodell (Supabase)

Alle Tabellen in `public`:

- `profiles` — 1:1 zu `auth.users`, hält `onboarding_state`
- `questionnaire_responses` — JSONB-Map `{ "1": "...", "2": "...", ..., "42": "..." }`
- `coach_profiles` — generiertes `config_md` + Modell + active-flag
- `conversations` + `messages` — Chat-History inkl. Token-Telemetrie für Cache-Auswertung
- `subscriptions` — Mirror der Stripe-Subscription, vom Webhook synchron gehalten

RLS überall aktiv, jeder User sieht nur eigene Zeilen. `coach_profiles`-Inserts laufen über den Service-Role-Client, weil sie der Profiler-Backend-Job schreibt.

## Setup

### 1. Supabase aufwecken + Schema anwenden

Das Projekt `spende` (id `wlxolfkhkxembiuofmfa`) ist aktuell pausiert. Restore manuell in der [Supabase-UI](https://supabase.com/dashboard/project/wlxolfkhkxembiuofmfa). Sobald `ACTIVE_HEALTHY`:

```bash
# über supabase CLI
supabase link --project-ref wlxolfkhkxembiuofmfa
supabase db push
```

…oder die Migration direkt im SQL-Editor einfügen:
- Datei: `supabase/migrations/0001_initial_schema.sql`
- Ggf. zuerst `drop table … cascade` für die alten Spende-Tabellen ausführen.

### 2. Env-Variablen

**Production:** alle Secrets ausschließlich in Vercel → Project Settings → Environment Variables. Niemals ins Repo committen — `.env*` ist in `.gitignore`.

**Lokal (Dev):** `cp .env.example .env.local` und ausfüllen:

| Var | Quelle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wlxolfkhkxembiuofmfa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase-Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | dito (server-only, **nie** mit `NEXT_PUBLIC_` prefixen) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (in Vercel als **Production-only** Env eintragen) |
| `STRIPE_SECRET_KEY` | Stripe-Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → Endpoint signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → API Keys |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Stripe → Products → Preise anlegen, IDs kopieren |
| `NEXT_PUBLIC_APP_URL` | Production-Domain (lokal: `http://localhost:3000`) |

> 🔐 `ANTHROPIC_API_KEY` und `SUPABASE_SERVICE_ROLE_KEY` sind beide vollwertige Backend-Schlüssel. In Vercel als „Sensitive" markieren — dann lassen sie sich nach dem Speichern nicht mehr einsehen.

### 3. Stripe-Produkt anlegen

Im Stripe-Dashboard:
1. Produkt `Coaching-Zwilling` anlegen
2. Zwei Preise dranhängen:
   - Monatlich: 29 € recurring monthly
   - Jährlich: 228 € recurring yearly (entspricht 19 €/Monat)
3. Webhook-Endpoint für `https://<deine-domain>/api/stripe/webhook` mit Events:
   - `checkout.session.completed`
   - `customer.subscription.{created,updated,deleted,paused,resumed,trial_will_end}`
   - `invoice.payment_{succeeded,failed}`

### 4. Lokal starten

```bash
npm install
npm run dev
```

→ http://localhost:3000

### 5. Deployment

Vercel:
- Projekt anlegen, Git verbinden, alle Env-Vars eintragen
- Region `fra1` (in `vercel.json` voreingestellt)
- `NEXT_PUBLIC_APP_URL` auf die Production-Domain setzen
- Stripe-Webhook-URL aktualisieren

## Promptanker — wo der Inhalt lebt

| Prompt | Ort |
|---|---|
| Scan-Intro (User sieht das im Onboarding) | `src/lib/coach/prompts.ts → SCAN_INTRO` |
| Auswertungs-Prompt (Profiler) | `src/lib/coach/prompts.ts → PROFILER_PROMPT` |
| Coach System-Prompt | `src/lib/coach/prompts.ts → COACH_SYSTEM_PROMPT` |
| 42 Fragen | `src/data/questionnaire.ts` |

Die zwei Prompts sind 1:1 aus dem Briefing übernommen. Änderungen am Coaching-Verhalten dort vornehmen, nicht im Code.

## Prompt-Caching-Strategie

Der System-Prompt für den Coach besteht aus zwei Blöcken (`src/lib/coach/system-prompt.ts`):
1. **Coach-System-Prompt** (statisch, ~1k Tokens) — kein Cache nötig
2. **User-Profil** (~2k–4k Tokens, stabil über alle Calls dieses Users) — `cache_control: ephemeral`

Heißt: der zweite Coach-Call und alle folgenden lesen das Profil aus dem Anthropic-Prompt-Cache. Token-Telemetrie (`cache_read_input_tokens`, `cache_creation_input_tokens`) wird pro Message in `messages` mitgeschrieben für spätere Auswertung.
