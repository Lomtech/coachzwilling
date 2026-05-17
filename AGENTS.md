# Agent-Hinweise — fuehrungs-coach

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Auth+Postgres+RLS), Stripe Subscriptions, Claude Sonnet 4.6 (Coach) + Opus 4.7 (Profiler).

## Konvention (Next 16 — wichtig!)
- `src/proxy.ts` statt `middleware.ts`
- `@supabase/ssr` mit `getAll()`/`setAll()` Cookie-API
- App-Router Route-Handler exportieren `runtime = 'nodejs'` wenn sie das Anthropic SDK nutzen (Edge-Runtime hat Limits beim Streaming + Buffer-API)
- Server-Komponenten by default; `'use client'` nur wenn State/Effects nötig

## Architektur
- **Coach-Zwilling:** ein Nutzer → ein Profil (`coach_profiles.config_md`) → wird als System-Prompt + Cache-Anker für jede Coach-Antwort genutzt.
- **Datenfluss:** Onboarding speichert Antworten roh in `questionnaire_responses` → Profiler-Edge-Function generiert `config_md` → Chat lädt `config_md` aus DB und steckt ihn in den Anthropic-Call (mit `cache_control: ephemeral`).
- **Paywall:** Stripe-Subscription-Status wird in `subscriptions.status` synchron gehalten via Webhook. Chat-Route checkt `status === 'active' || status === 'trialing'`.

## Tabellen (Supabase)
- `profiles` — 1:1 zu `auth.users`, basic info
- `questionnaire_responses` — JSONB der 42 Antworten
- `coach_profiles` — generiertes `config_md` + Tonprofil
- `conversations`, `messages` — Chat-History
- `subscriptions` — Stripe-Sync

## Geheimnisse / Schreibregeln
- Keine Geheimnisse hardcoden, immer aus `process.env`
- `SUPABASE_SERVICE_ROLE_KEY` nur in Route-Handlern und Server-Actions, NIE im Client
- Stripe-Webhook validiert HMAC vor jedem Side-Effect
- Auswertungs-Prompt + Coach-System-Prompt liegen in `src/lib/coach/prompts.ts` als reine Konstanten
