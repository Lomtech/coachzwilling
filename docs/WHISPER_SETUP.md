# Server-STT — Setup-Anleitung

Server-side Speech-to-Text für den Coaching-Zwilling. Diese Anleitung zeigt **drei Varianten**, sortiert nach DSGVO-Konformität:

1. **Speechmatics (Variante A)** — EU-Hosting, AVV, ISO 27001. **Empfohlen.**
2. **OpenAI Whisper (Variante B)** — US-Hosting. Pragmatisch wenn EU egal.
3. **Disabled (Variante C)** — Feature aus.

Für die strikte EU-Linie kombinierst du **Variante A** mit `NEXT_PUBLIC_SPEECH_PROVIDER=disabled` — siehe Abschnitt „DSGVO-Vollausbau" unten.

## DSGVO-Ehrlichkeit vorab

**Drei Stellen, wo Audio-Daten leaken können:**

| Pfad | Wer hört mit? | DSGVO |
|---|---|---|
| **Web Speech API** (Live-Mikro, heutiger Default) | Chrome → Google, Safari → Apple, Edge → MS | ❌ kein AVV mit deinem Dienst — Audio leakt unsichtbar |
| **OpenAI Whisper direkt** | OpenAI (USA) | ❌ US-Hosting, AVV nur über OpenAI Enterprise |
| **Speechmatics (eu1)** | Speechmatics GmbH | ✅ EU-Hosting, Standard-AVV, ISO 27001 |

Wenn du DSGVO-strikt willst, **musst** du beide Pfade fixen: Web Speech API ausschalten **und** Speechmatics anbinden.

---

## Variante A — Speechmatics (EU, empfohlen)

### Schritt 1 — Account + AVV

1. [portal.speechmatics.com](https://portal.speechmatics.com) → Sign up
2. Bei Account-Erstellung **EU-Region** wählen (default: eu1 Frankfurt)
3. **Settings → Legal → Data Processing Agreement** → digital unterzeichnen. PDF lokal sichern für dein Art-30-Verzeichnis und für eine DSFA bei Coaching-Daten.

### Schritt 2 — API-Key generieren

1. **Settings → API Keys → Create new key**
2. Name z.B. `coachzwilling-prod`
3. Kopieren — wird nur einmal angezeigt.
4. Zweiten Key `coachzwilling-dev` für lokal anlegen.

API-Keys sind nicht region-gebunden — die Region steuerst du über die Endpoint-URL (siehe `SPEECHMATICS_REGION` Env-Var).

### Schritt 3 — Lokale `.env.local`

```bash
STT_PROVIDER=speechmatics
SPEECHMATICS_API_KEY=...
SPEECHMATICS_REGION=eu1
SPEECHMATICS_OPERATING_POINT=enhanced
```

`enhanced` ist die teurere, genauere Variante (~$0.008/Min). Für Coaching-Audio mit Fachvokabular lohnt sich das. Wenn die Kosten kleiner werden müssen: `standard` (~$0.005/Min).

### Schritt 4 — Vercel-Production

1. Vercel-Dashboard → **Project Settings → Environment Variables**
2. Für **Production** anlegen:
   - `STT_PROVIDER=speechmatics`
   - `SPEECHMATICS_API_KEY=...` → **Sensitive**
   - `SPEECHMATICS_REGION=eu1`
   - `SPEECHMATICS_OPERATING_POINT=enhanced`
3. Redeploy.

### Schritt 5 — Smoke-Test

In Firefox oder OpenAI Atlas:

1. `https://<deine-domain>/api/transcribe` → sollte `{"enabled":true}` liefern
2. Coach-Chat öffnen → Mikro-Knopf sichtbar
3. Klick → Mikro-Permission erlauben → roter Puls (Aufnahme)
4. Sprich 2–5 s, klick Stop → Spinner für 2–5 s → Transkript im Input

Wenn 4× hintereinander failed: Vercel-Logs prüfen auf `[transcribe] provider error`. Häufigste Ursachen:
- API-Key falsch oder noch nicht aktiviert
- Region-URL passt nicht zum Key (Key wurde im US-Account erstellt, aber `SPEECHMATICS_REGION=eu1`)
- Audio-Format nicht erkannt (sollte nicht passieren — Speechmatics frisst webm/opus)

### Schritt 6 — Kostenmonitor

Im Speechmatics-Portal: **Usage** zeigt täglichen Minutenverbrauch + Kosten.

Beispielrechnung: 100 Coaches × 50 Antworten/Monat × 20 s Sprechzeit
= 100.000 s = 1666 Min × $0.008 = **~$13 / Monat**.

Bei deinem aktuellen Userzahl-Stand (0 zahlende Studios) faktisch $0.

---

## Variante B — OpenAI Whisper (US, pragmatisch)

**Warnung:** Audio fliesst zu OpenAI/USA. Bricht die EU-Linie. Nur wenn du das bewusst willst und im Cookie-Banner / der Datenschutzerklärung sauber ausweist.

### Schritt 1 — OpenAI-Key

1. [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new secret key
2. Restricted-Key nur für `audio.transcriptions`
3. Key kopieren

### Schritt 2 — `.env.local` / Vercel

```bash
STT_PROVIDER=openai
OPENAI_API_KEY=sk-...
# Optional: anderes Modell — Default whisper-1
# OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

### Smoke-Test wie Variante A.

---

## Variante C — Disabled (Default)

Nichts setzen, oder explizit:

```bash
STT_PROVIDER=disabled
```

→ `/api/transcribe` liefert 503. Der Whisper-Knopf erscheint nicht im Chat. Atlas-User können nicht sprechen — sehen aber den klaren Hinweis „Wechsle auf Chrome/Edge/Safari".

---

## DSGVO-Vollausbau (was du WIRKLICH brauchst)

Wenn du B2B-Pitches mit DSFA-Anforderungen machst, reicht ein STT-Wechsel nicht. Drei Stellen müssen zusammen passen:

```bash
# 1. LLM-Inferenz über Langdock EU
LLM_PROVIDER=langdock
LANGDOCK_API_KEY=...
LANGDOCK_REGION=eu

# 2. Server-STT über Speechmatics EU
STT_PROVIDER=speechmatics
SPEECHMATICS_API_KEY=...
SPEECHMATICS_REGION=eu1
SPEECHMATICS_OPERATING_POINT=enhanced

# 3. Browser-Live-Mikro ABSCHALTEN (sonst leakt Audio an Google/Apple/MS)
NEXT_PUBLIC_SPEECH_PROVIDER=disabled
```

Damit:
- Coaching-Text fliesst nur durch Langdock-EU
- Audio fliesst nur durch Speechmatics-EU
- Web Speech API ist deaktiviert — User sieht beim Mikro-Klick „Live-Spracheingabe deaktiviert (DSGVO), nutze stattdessen den Aufnahme-Button"
- Whisper-Aufnahme-Knopf (Push-to-talk) ist der einzige Mikro-Pfad — gleicher UX in allen Browsern

**Was du dann noch klären musst** (Code kann das nicht):
- AVVs unterzeichnet bei: Langdock, Speechmatics, Supabase, Vercel, Stripe, Resend
- Cookie-Banner deklariert: Supabase-Cookies, Stripe-Iframe, ggf. Vercel-Analytics
- DSFA für Coaching-Profile (Art. 35 DSGVO) — Coaching-Daten sind besonders sensibel, weil persönlichste Selbstreflexion
- Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO) gepflegt
- Resend → EU-E-Mail-Provider tauschen (Postmark EU, Mailjet, Brevo) — separate Migration

---

## Rückweg

Wenn was nicht funktioniert, schrittweise zurück:

| Was geht kaputt | Lösung |
|---|---|
| Coach-Chat antwortet nicht | `LLM_PROVIDER=anthropic` → fallback auf Direkt-API |
| Mikro-Aufnahme failed | `STT_PROVIDER=disabled` → Feature ausblenden |
| User klagen, dass Live-Mikro fehlt | `NEXT_PUBLIC_SPEECH_PROVIDER=browser` zurück (bewusste Entscheidung: Live-UX wichtiger als strikte EU-Linie) |

Alle drei Wege brauchen nur Env-Änderung + Redeploy, kein Code.

---

## Was im Code passiert (kurz)

- `src/lib/stt/client.ts` — Provider-Factory: `speechmatics` | `openai` | `disabled`
- `src/lib/stt/speechmatics.ts` — EU-Adapter: POST job → poll → GET transcript
- `src/lib/stt/openai.ts` — US-Adapter: synchroner POST
- `src/app/api/transcribe/route.ts` — Auth-Gate, 25 MB Limit, language=de, Coaching-Vokabular-Prompt
- `src/components/chat/useSpeechInput.ts` — respektiert `NEXT_PUBLIC_SPEECH_PROVIDER=disabled`
- `src/components/chat/useWhisperInput.ts` — MediaRecorder-basierter Server-STT-Pfad
- `src/components/chat/ChatView.tsx` — wählt automatisch Live-Mikro vs Aufnahme-Knopf

Hook prüft beim Mount via `GET /api/transcribe`, ob STT enabled ist. Ohne aktiven Provider erscheint der Aufnahme-Knopf gar nicht.

## Quellen

- [Speechmatics Batch Quickstart](https://docs.speechmatics.com/introduction/quickstart)
- [Speechmatics API Reference](https://docs.speechmatics.com/api-ref)
- [Speechmatics Authentication](https://docs.speechmatics.com/get-started/authentication)
- [OpenAI Speech-to-Text Guide](https://platform.openai.com/docs/guides/speech-to-text)
