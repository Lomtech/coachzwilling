# Architektur

## Datenfluss

```
Signup → profiles.onboarding_state = 'pending'
   ↓
Onboarding-Intro (/onboarding)
   ↓ [User klickt "Los geht's"]
Scan (42 Fragen, eine pro Bildschirm)
   ↓ [Auto-Save → questionnaire_responses.answers (JSONB)]
   ↓ [Letzte Frage → POST /api/onboarding/finalize]
Profiler (Claude Opus 4.7)
   ↓ [PROFILER_PROMPT + Scan-Output → config_md]
   ↓ [Insert in coach_profiles, profiles.onboarding_state = 'profiled']
   ↓
Coach-Gate prüft Subscription
   ↓ [keine? → /billing]
   ↓ [Stripe Checkout → Webhook → subscriptions.status = 'trialing']
   ↓
Coach (/coach)
   ↓ [POST /api/chat mit message + conversationId?]
   ↓ [SSE-Stream zurück]
   ↓ [Persist user+assistant message in messages]
```

## Coach-Call (Anthropic)

```
system: [
  { type: 'text', text: COACH_SYSTEM_PROMPT },                       // ~1k tokens, no cache
  { type: 'text', text: '... PROFIL ...', cache_control: { type: 'ephemeral' } }  // ~2-4k, cached
]
messages: [...history, { role: 'user', content: <neuer text> }]
model: claude-sonnet-4-6
max_tokens: 1024
```

Antwort als SSE-Stream:
- `event: meta` → `{ conversationId }`
- `event: delta` → `{ text }` pro Token-Chunk
- `event: done` → fertig
- `event: error` → Fehlerursache

## RLS-Modell

Alle Tabellen haben RLS an. Policies:
- `profiles.{select, update}` → `auth.uid() = id`
- `questionnaire_responses.{select, insert, update}` → `auth.uid() = user_id`
- `coach_profiles.select` → `auth.uid() = user_id` (Insert nur via Service-Role)
- `conversations.all` → `auth.uid() = user_id`
- `messages.{select, insert}` → `auth.uid() = user_id`
- `subscriptions.select` → `auth.uid() = user_id` (Insert/Update nur via Service-Role)

## Trigger

- `auth.users INSERT` → automatisch `profiles`-Row anlegen (`handle_new_user`)
- `*_touch` updaten `updated_at` bei jedem Update

## Service-Role-Aufrufe (im Backend)

Folgende Routen nutzen `serviceClient()`:
- `/api/onboarding/finalize` — `coach_profiles` insert + `profiles.onboarding_state` update
- `/api/chat` — `conversations` create, `messages` insert (parallele Schreibvorgänge nach Stream-End)
- `/api/stripe/*` — `subscriptions` upsert via Webhook-Sync

## Onboarding-State-Machine

| State | Bedeutung |
|---|---|
| `pending` | Nach Signup, vor Onboarding-Klick |
| `questionnaire` | Scan läuft (bei `/onboarding/start`) |
| `profiled` | Profil erstellt, kann Coach nutzen |
| `active` | Aktive Nutzung (optional, wir bleiben aktuell auf `profiled`) |

## Kosten-Annahme (Indikation)

- Profiler-Call (einmalig pro User): ~6k Input + ~3k Output @ Opus 4.7 ≈ 0,15 €
- Coach-Call (mit Cache-Hit nach Erstgespräch): ~500 Cache-Read + ~50 fresh Input + ~150 Output @ Sonnet 4.6 ≈ 0,003 € pro Antwort
- Bei 30 Antworten/Monat/User: ~0,09 € KI-Kosten

→ Marge bei 19–29 €/Monat ist bequem.
