# Coaching-Zwilling

Ein KI-Coaching-Zwilling für Führungskräfte, gebaut auf Next.js 16, Supabase, Stripe und Claude.

**Konzept:** User füllt einen 50-Fragen-Scan aus (Denkhorizonte-Methodik V3, Stand 5.6.26). An fünf festen Stellen (Q4, Q21, Q30, Q33, Q40) gibt es eine Nachfrage. Daraus generiert Claude Opus 4.7 in einem Lauf zwei Outputs — Output A (Rohprofil für den Nutzer) + Output B (Wissensdatei B1–B15 als Coach-Anker). Beide bilden zusammen den System-Prompt + Cache-Anker für jeden Coach-Dialog mit Claude Sonnet 4.6.

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
- `questionnaire_responses` — JSONB-Map `{ "1": "...", "2": "...", ..., "50": "..." }`. Antworten an Q4/Q21/Q30/Q33/Q40 können das Format `"<Hauptantwort> | <Nachfrage-Antwort>"` haben.
- `coach_profiles` — generiertes `config_md` (Output A + B in einem Markdown) + Modell + active-flag
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
| Auswertungs-Prompt V5 (Profiler, Output A+B) | `src/lib/coach/prompts.ts → PROFILER_PROMPT` |
| Coach System-Prompt V4 (4-Modus-Logik) | `src/lib/coach/prompts.ts → COACH_SYSTEM_PROMPT` |
| Profile-Refine-Prompt V5 (Tiefen-Refresh) | `src/lib/coach/prompts.ts → PROFILE_REFINE_PROMPT` |
| 50 Fragen + 5 feste Nachfragen | `src/data/questionnaire.ts` |

Die Prompts sind 1:1 aus dem Deep-Space-Briefing (Stand 5.6.26) übernommen. Änderungen am Coaching-Verhalten dort vornehmen, nicht im Code.

**Fragebogen-Struktur (V3, 13 Blöcke):**

1. Ressourcen & Realität (Q1–Q4) — Nachfrage bei Q4
2. Ziel vs. Weg vs. Identität (Q5–Q7)
3. Motivstruktur (Q8–Q11)
4. Emotionales Grundmuster (Q12–Q15)
5. Weltbild & Entscheidungslogik (Q16–Q18)
6. Ehrlichkeit & Selbstbild (Q19–Q21) — Nachfrage bei Q21
7. Umsetzung (Q22–Q24)
8. Coaching-Stil & Veränderung (Q25–Q28)
9. Zukunft & Energie (Q29–Q31) — Nachfrage bei Q30
10. Stärke, Schatten & Entwicklung (Q32–Q39, neu in V3) — Nachfrage bei Q33
11. Sinn des Coaching-Zwillings (Q40–Q42) — Nachfrage bei Q40
12. Grenzen (Q43–Q45)
13. Kontext (Q46–Q50)

**Coaching-Modus-Klassifikation (B9):** KONFRONTATION / KONFRONTATION MIT SUBSTANZ / RAUM / RÜCKENWIND — Primärsignale aus Q8–Q18 (1 Punkt), Zusatzsignale aus Q25–Q28 und Q40 (0,5 Punkte). Sekundärer Modus = ≥3 Treffer. Validierung gegen Q25–Q28 (Vorrang bei eindeutigem Widerspruch).

## Prompt-Caching-Strategie

Der System-Prompt für den Coach besteht aus vier Blöcken (`src/lib/coach/system-prompt.ts`):
1. **Profil (Output A + B)** — `cache_control: ephemeral`, ~6–8k Tokens, dominiert die Aufmerksamkeit
2. **Coach-System-Prompt V4** (statisch, ~3k Tokens) — kein Cache nötig
3. **Living Memory** (optional, cached) — wächst nach jedem Gespräch
4. **Finale Anweisung** (B14 Tonprofil-Echo + B15 Sprach-Mirror + absolute Verbote) — kein Cache, höchste Recency

Heißt: der zweite Coach-Call und alle folgenden lesen Profil + Memory aus dem Anthropic-Prompt-Cache. Token-Telemetrie (`cache_read_input_tokens`, `cache_creation_input_tokens`) wird pro Message in `messages` mitgeschrieben für spätere Auswertung.
