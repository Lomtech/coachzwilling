# Agent-Hinweise — deepling

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Auth+Postgres+RLS), Stripe Subscriptions, Claude Sonnet 4.6 (Coach + Profiler) + Haiku 4.5 (Memory). Profiler war initial Opus 4.7 — auf Sonnet 4.6 runtergezogen damit der Generierungs-Call in Vercel Hobby (60s) und ~5× günstiger durchläuft; per `CLAUDE_PROFILER_MODEL=claude-opus-4-7` re-aktivierbar. LLM-Provider via `LLM_PROVIDER` umschaltbar: `anthropic` (default, Direkt-API), `bedrock` (AWS eu-central-1), `langdock` (EU-Hosting, DSGVO/ISO27001/SOC2). Alle Calls gehen über die zentrale `anthropic()`-Factory in `src/lib/claude/client.ts` — kein call-site-spezifischer Code.

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
- **Kein Mikrofon / kein Speech-to-Text mehr** (ausgebaut 2026-07-11). Die komplette Sprach-Eingabe (Web Speech API, Whisper-/Speechmatics-Fallback, `src/lib/stt/`, `/api/transcribe`, die Mikro-Buttons) wurde entfernt: Der Browser verbietet Websites, eine einmal blockierte Mikro-Berechtigung per Code aufzuheben — Nutzer, die den Zugriff je abgelehnt hatten, landeten in einer Sackgasse, die kein Code beheben kann. Eingabe ist reiner Text; wer sprechen will, nutzt das Diktat seines Geräts (Mac: 2× fn) direkt im Textfeld. Falls je reaktiviert: Env-Vars `SPEECHMATICS_*` / `NEXT_PUBLIC_SPEECH_PROVIDER` in Vercel sind noch gesetzt und müssten aufgeräumt werden.
