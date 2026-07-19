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
- **Paywall (Zwei-Stufen, Stand 17.07.2026 — NICHT zurückbauen):** Der **Gratis-Chat ist für alle offen** (kein Billing-Gate in `proxy.ts`/`chat/route.ts` mehr — nur Onboarding-Check auf aktives Profil). Monetarisiert wird die **149-€-Einmalzahlung** (`mode:'payment'`, `STRIPE_PRICE_FULL`), die Teil 2 + Vollprofil freischaltet (`profiles.full_unlocked`, gesetzt vom Webhook-Zweig `session.mode==='payment'` + Success-Fallback). Das alte Abo (`subscriptions`) bleibt für B2B im Code, gated aber nichts mehr am Chat.

## Zwei-Stufen-Architektur (Briefing „Deepling Entwickler-Briefing Stand 170726" — verbindliche Spec)
- **Interne Fragen-Nummerierung 1–50 bleibt** (`questionnaire.ts`, `id`=Dateireihenfolge). `TEIL1_IDS` (22: 1–4,8–15,19–24,36–37,47,49) vs. Rest = Teil 2 (28). `questionsForPart(part)` liefert die Fragen; `answersToScanText(answers,{part})` das Subset.
- **Teil 1 (kostenlos):** `QuestionnaireFlow part={1}` (22 Fragen + Q21-Nachfrage) → `finalize {part:1}` → `streamMiniCoachProfile` (`MINI_PROFILER_PROMPT`, prompts-mini.ts) → `coach_profiles` **`tier='mini'`** (config_md = A-Mini M1–M3 + `---` + B-Mini MB0–MB6) → Mini-Deep-Space-Doc (`deepspace-html`, 149-€-M4-Block) + Gratis-Chat.
- **Kauf → Teil 2:** `/billing` 149-€-Kachel → Checkout `plan:'full'` → Webhook setzt `full_unlocked` → `/onboarding` erkennt `tier='mini'`+`full_unlocked` → `QuestionnaireFlow part={2}`. **Pflicht-Einstieg = Vertiefung zu Q4** (`vertiefungQ4Prompt(q4main)`, Antwort landet als Nachfrage-Teil von `answers["4"]` = „main | vertiefung"). Danach 28 Fragen (Q30/33/40-Nachfragen).
- **Freischalt-Code statt Kauf (2026-07-19):** Auf `/billing` gibt es unter dem Kauf-Button den Weg „Ich habe einen Freischalt-Code" (`UnlockCodeForm`) → `POST /api/unlock/redeem` → atomarer RPC `redeem_unlock_code(p_code,p_user_id)` (Migration `0005_unlock_codes`) setzt `full_unlocked` gratis. Der Code-Weg ist die **einzige** Alternative, die `full_unlocked` setzt — die alten `org_activation_codes`/`redeem.ts` (B2B-Seats) tun das NICHT. Codes erzeugt der Coach unter **`/admin/codes`** (admin-gated via Layout `requireAdmin`; Einzel-Codes pro Klient, einmal einlösbar, `label`=Klient, Status-Liste). Tabelle `unlock_codes` ist RLS-dicht (nur Service-Role + SECURITY-DEFINER-RPC). Nicht mit `org_activation_codes` verwechseln.
- **Voll-Auswertung:** `finalize {part:2}` (Gate: `full_unlocked` ODER `grandfathered`) → `streamFullCoachProfileV51` (`profilerPromptV51()` = V5.1-Zusatz + PROFILER_PROMPT, + Mini-Kontinuität) über alle 50 → `coach_profiles` **`tier='full'`** (deaktiviert Mini = **stiller Swap**). Chat lädt aktives Profil + `tier` → `buildCoachSystem(..., {tier})` wählt Block 2: `MINI_SYSTEM_PROMPT` (mini) vs. `COACH_SYSTEM_PROMPT` V4.1 (full).
- **Renderer nach `tier`:** `/mein-profil` zeigt `mini` (Paywall→/billing) bzw. `full` (kein Paywall) je nach `coach_profiles.tier`.
- **Neue Prompts** liegen in `src/lib/coach/prompts-mini.ts` (Ausnahme von der „alles in prompts.ts"-Konvention, bewusst für die Stage-Trennung). V4→**V4.1** = Anrede-Regel (firstName-Tail) + Aufnahme-Regel (im COACH_SYSTEM_PROMPT).
- **Env nötig:** `STRIPE_PRICE_FULL` (149-€-Einmalpreis) — sonst wirft der `full`-Checkout „STRIPE_PRICE_FULL fehlt".

## Tabellen (Supabase)
- `profiles` — 1:1 zu `auth.users`, basic info
- `questionnaire_responses` — JSONB der 50 Antworten (5 davon enthalten optional die feste Nachfrage)
- `coach_profiles` — generiertes `config_md` (Output A + B), `tone_oneliner` (B14), `language_mirror` (B15), **`tier` ('mini'=Teil-1-Profil / 'full'=Vollprofil; Default 'full' für Bestand)**
- `conversations`, `messages` — Chat-History
- `subscriptions` — Stripe-Sync

## Geheimnisse / Schreibregeln
- Keine Geheimnisse hardcoden, immer aus `process.env`
- `SUPABASE_SERVICE_ROLE_KEY` nur in Route-Handlern und Server-Actions, NIE im Client
- Stripe-Webhook validiert HMAC vor jedem Side-Effect
- Auswertungs-Prompt + Coach-System-Prompt liegen in `src/lib/coach/prompts.ts` als reine Konstanten
- LLM-Calls niemals direkt via `new Anthropic(...)` — immer über `anthropic()`-Factory in `src/lib/claude/client.ts` (sonst bricht der Provider-Switch). Bei Langdock-Betrieb prüfen ob `cache_control: ephemeral` durchgereicht wird (Telemetrie in `messages.cache_read_input_tokens`)
- **Spracheingabe** — `useVoiceInput` (`src/components/chat/`) + `/api/transcribe` → `transcribe()` aus `src/lib/stt/client.ts` (Speechmatics EU/Frankfurt; OpenAI-Whisper-Adapter als US-Alternative). STT-Calls NIE direkt, immer über die Factory. Siehe `docs/WHISPER_SETUP.md`.
- **Mikro-Design (neu gebaut 2026-07-11, nach Speechmatics' eigenem Leitfaden — nicht zurückbauen!):** (1) Berechtigung **vorab** per Permissions API prüfen, statt den Nutzer klicken und ins Leere laufen zu lassen. (2) `getUserMedia` **nur im Klick-Handler**, kein `await` davor — sonst blocken Browser still. (3) **Kein** Vorab-Erklär-Popup (rät der Leitfaden ab). **Harte Grenze (per Doku bestätigt, gilt für ALLE Anbieter inkl. Grok/ChatGPT):** Ein auf „blockiert" gesetztes Mikro-Recht kann keine Website per Code aufheben — es gibt keine API dafür. **Deshalb der Fallback ohne jede Berechtigung:** `<input type="file" accept="audio/*" capture>` übergibt an den OS-Recorder (Android) bzw. Datei-Dialog und schickt die Datei an dieselbe `/api/transcribe`-Route. Bei `permission === 'denied'` schaltet der Mikro-Button automatisch darauf um → **niemand landet in einer Sackgasse**. Zweiter Ausweg, falls je nötig: Berechtigungen gelten **pro Origin** — `www.deepling.de` ist eine eigene Origin (leitet NICHT auf die Apex um) und damit unabhängig blockierbar/nutzbar.
