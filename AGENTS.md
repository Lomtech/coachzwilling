# Agent-Hinweise — fuehrungs-coach

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Auth+Postgres+RLS), Stripe Subscriptions, Claude Sonnet 4.6 (Coach) + Opus 4.7 (Profiler) + Haiku 4.5 (Memory). LLM-Provider via `LLM_PROVIDER` umschaltbar: `anthropic` (default, Direkt-API), `bedrock` (AWS eu-central-1), `langdock` (EU-Hosting, DSGVO/ISO27001/SOC2). Alle Calls gehen über die zentrale `anthropic()`-Factory in `src/lib/claude/client.ts` — kein call-site-spezifischer Code.

## Konvention (Next 16 — wichtig!)
- `src/proxy.ts` statt `middleware.ts`
- `@supabase/ssr` mit `getAll()`/`setAll()` Cookie-API
- App-Router Route-Handler exportieren `runtime = 'nodejs'` wenn sie das Anthropic SDK nutzen (Edge-Runtime hat Limits beim Streaming + Buffer-API)
- Server-Komponenten by default; `'use client'` nur wenn State/Effects nötig

## Architektur
- **Coach-Zwilling:** ein Nutzer → ein Profil (`coach_profiles.config_md`, Deep-Space V5 mit Output A + B) → wird als System-Prompt + Cache-Anker für jede Coach-Antwort genutzt.
- **Datenfluss:** Onboarding speichert Antworten roh in `questionnaire_responses` (50 Fragen, Q4/Q21/Q30/Q33/Q40 enthalten optional `"main | followUp"`-Strings) → Profiler generiert `config_md` (A1–A9 + B1–B15) → Chat lädt `config_md` aus DB und steckt ihn in den Anthropic-Call (mit `cache_control: ephemeral`).
- **Coaching-Modus (B9):** Profiler klassifiziert den Coach in KONFRONTATION / KONFRONTATION MIT SUBSTANZ / RAUM / RÜCKENWIND mit primärem + (optional) sekundärem Modus. Coach folgt durchgehend dem primären, alle 4–5 Züge ein Impuls aus dem sekundären Modus.
- **Paywall:** Stripe-Subscription-Status wird in `subscriptions.status` synchron gehalten via Webhook. Chat-Route checkt `status === 'active' || status === 'trialing'`.

## Tabellen (Supabase)
- `profiles` — 1:1 zu `auth.users`, basic info
- `questionnaire_responses` — JSONB der 50 Antworten (5 davon enthalten optional die feste Nachfrage)
- `coach_profiles` — generiertes `config_md` (Output A + B), `tone_oneliner` (B14), `language_mirror` (B15)
- `conversations`, `messages` — Chat-History
- `subscriptions` — Stripe-Sync

## Geheimnisse / Schreibregeln
- Keine Geheimnisse hardcoden, immer aus `process.env`
- `SUPABASE_SERVICE_ROLE_KEY` nur in Route-Handlern und Server-Actions, NIE im Client
- Stripe-Webhook validiert HMAC vor jedem Side-Effect
- Auswertungs-Prompt + Coach-System-Prompt liegen in `src/lib/coach/prompts.ts` als reine Konstanten
- LLM-Calls niemals direkt via `new Anthropic(...)` — immer über `anthropic()`-Factory in `src/lib/claude/client.ts` (sonst bricht der Provider-Switch). Bei Langdock-Betrieb prüfen ob `cache_control: ephemeral` durchgereicht wird (Telemetrie in `messages.cache_read_input_tokens`)
- Speech-to-Text-Calls niemals direkt — immer über `transcribe()` aus `src/lib/stt/client.ts` (provider-agnostisch, default `disabled`). Whisper-Default-Provider ist OpenAI (US-Hosting); EU-Alternativen brauchen einen neuen Adapter in `src/lib/stt/`. Siehe `docs/WHISPER_SETUP.md`.
