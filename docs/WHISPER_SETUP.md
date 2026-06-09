# Whisper-Fallback — Setup-Anleitung

Diese Anleitung beschreibt den Whisper-Fallback für Browser ohne Web Speech API. Der Live-Mikro-Pfad (Chrome, Edge, Safari) bleibt unverändert — Whisper kommt nur dazu für **Firefox** und **OpenAI Atlas** sowie für alle Browser, in denen die Web-Speech-Permission blockiert ist.

## Wie das im Code aussieht

| Pfad | Aktiv wenn | Latenz | Kosten |
|---|---|---|---|
| Web Speech API (`useSpeechInput`) | Browser unterstützt `webkitSpeechRecognition` | Live (interim + final) | 0 |
| Whisper-Fallback (`useWhisperInput` → `/api/transcribe`) | Browser hat KEINE Web Speech API, aber MediaRecorder + STT-Provider konfiguriert | Push-to-talk + 1–4 s Upload | ~$0.006/Min |

Der Coach-Chat blendet automatisch den richtigen Knopf ein. Du brauchst clientseitig nichts tun.

## DSGVO-Ehrlichkeit

**Wichtiger Hinweis vorab — sonst rutschst du in die EU-Datenfalle.**

Langdock proxy't aktuell **kein** Audio-/Whisper-Endpoint (verifiziert via [docs.langdock.com/llms.txt](https://docs.langdock.com/llms.txt), Stand 2026-06). Die einzigen out-of-the-box Whisper-Provider sind:

| Provider | Hosting | DSGVO | Aufwand |
|---|---|---|---|
| **OpenAI Whisper direkt** | USA | ❌ Audio fliesst an OpenAI/USA, AVV nur über OpenAI Enterprise | trivial |
| **Speechmatics** | UK/EU | ✅ EU-Hosting + Standard-AVV | mittel — eigener Provider, eigener Key |
| **Deepgram (EU-Region)** | EU | ✅ EU-Hosting + DPA | mittel — eigener Provider |
| **Self-hosted Whisper** (Hetzner GPU, Replicate EU, etc.) | EU | ✅ volle Kontrolle | hoch — Infrastruktur |

Der Code ist provider-agnostisch — du wählst per Env-Var. Default ist `disabled`: ohne explizite Wahl ist das Feature aus, und Atlas-/Firefox-User sehen den Live-Mikro-Disabled-Hinweis statt eines Whisper-Buttons.

## Variante A — OpenAI Whisper direkt (schnellster Pfad)

**Warnung:** Audio (≠ Coaching-Text) fliesst zu OpenAI/USA. Für die strikte EU-Linie nicht passend. Wenn du das pragmatisch machen willst (z.B. wenige Atlas-User, bewusste Entscheidung): folgendes Setup.

### Schritt 1 — OpenAI-Key

1. [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → **Create new secret key**
2. Name z.B. `coachzwilling-whisper`
3. Permissions: nur `audio.transcriptions` reicht — Restricted-Key bauen wenn dein OpenAI-Plan das hergibt
4. Key kopieren und in den Passwortmanager

### Schritt 2 — Lokale `.env.local`

```bash
STT_PROVIDER=openai
OPENAI_API_KEY=sk-...
# Optional: anderes Whisper-Modell. Default ist whisper-1.
# Neuere gpt-4o-*-transcribe Modelle sind genauer aber teurer.
# OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

### Schritt 3 — Vercel-Production-Env

1. Vercel-Dashboard → **Project Settings → Environment Variables**
2. Für **Production** anlegen:
   - `STT_PROVIDER=openai`
   - `OPENAI_API_KEY=sk-...` als **Sensitive** markieren
3. Redeploy auslösen.

### Schritt 4 — Smoke-Test im Browser

1. Öffne den Coach-Chat in einem Browser **ohne** Web Speech API (Firefox oder Atlas)
2. Mikro-Button sollte sichtbar sein und nicht ausgegraut
3. Klick drauf → Browser fragt nach Mikrofon-Permission → erlauben
4. Sprich 2–3 Sekunden, klick Stop
5. Spinner für ~1–3 s → Text erscheint im Input

Wenn der Button **nicht** erscheint: `/api/transcribe` mit GET aufrufen
```bash
curl https://<deine-domain>/api/transcribe
```
sollte `{"enabled":true}` liefern. Falls `{"enabled":false}` → Env nicht gesetzt oder Vercel-Deploy hat sie nicht übernommen.

## Variante B — Speechmatics (EU-konform)

**Status: nicht implementiert.** Der Adapter ist auf Erweiterung vorbereitet, fehlt aber noch in `src/lib/stt/`. Wenn du das willst, sag Bescheid:

1. Speechmatics-Konto + EU-Region wählen
2. AVV unterzeichnen
3. API-Key generieren
4. Code-Erweiterung: `src/lib/stt/speechmatics.ts` (Adapter), `client.ts` (Branch), `STT_PROVIDER=speechmatics`-Variante

Aufwand: ~1–2 h Code, $20/Mio Sekunden Audio bei Speechmatics Standard.

## Variante C — Self-hosted Whisper

**Status: nicht implementiert.** Optionen:

- **Replicate** (`openai/whisper`-Endpoint) mit EU-Region
- **Eigener Hetzner-GPU-Container** mit `faster-whisper` oder `whisper.cpp`
- **Ollama / LM Studio** für Dev-Setup

Code-Erweiterung wäre `src/lib/stt/self-hosted.ts` + Endpoint-URL via Env. Sag Bescheid wenn du das willst.

## Kosten-Beispielrechnung (Variante A)

Annahmen: ein User spricht 1× pro Coach-Antwort 20 Sekunden, 50 Coaching-Antworten pro Monat.

- 50 × 20 s = 1000 s = ~17 Min
- 17 Min × $0.006 = ~$0.10 / User / Monat
- Bei 100 zahlenden Studios à 1 User: ~$10 / Monat zusätzlich

Das ist überschaubar — wenn die Atlas-Nutzergruppe klein bleibt, kann Variante A pragmatisch sein, bis sich die EU-Variante lohnt.

## Rückweg

Whisper-Fallback abschalten:

```bash
STT_PROVIDER=disabled
```

→ Redeploy. Live-Mikro funktioniert weiter wo Web Speech API da ist, der Whisper-Button verschwindet im Composer.

## Was im Code passiert (kurz)

- `src/lib/stt/client.ts` — Provider-Switch (`STT_PROVIDER`), Default `disabled`
- `src/lib/stt/openai.ts` — OpenAI-Whisper-Adapter (multipart-Upload)
- `src/app/api/transcribe/route.ts` — Auth-Gate, 25 MB Limit, `language=de`-Default, Coaching-Vokabular-Prompt
- `src/components/chat/useWhisperInput.ts` — MediaRecorder-basierter Client-Hook (webm/opus → POST FormData)
- `src/components/chat/ChatView.tsx` — wählt automatisch zwischen Web Speech und Whisper

Der Hook prüft beim Mount via `GET /api/transcribe`, ob die Server-Route aktiv ist. Ohne aktiven STT-Provider blendet die UI den Whisper-Button erst gar nicht ein.
