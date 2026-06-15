# Langdock-Setup — Schritt für Schritt

Diese Anleitung beschreibt den Wechsel von **Anthropic-Direkt** auf **Langdock**, damit alle Claude-Calls über einen DSGVO-konformen, EU-gehosteten Proxy laufen.

## Warum Langdock?

| Anforderung | Anthropic Direct | Langdock |
|---|---|---|
| Hosting der Inferenz | USA | EU (Frankfurt) oder USA, wählbar |
| DSGVO-AVV (Art. 28) | nur über Enterprise-Vertrag | Standard für alle Workspaces |
| ISO 27001 | Anthropic ja (USA) | Langdock ja (EU) |
| SOC 2 Type II | ja | ja |
| Customer-Daten als Trainingsmaterial | nein (per Default) | nein (per Default) |
| Cache-Control (`ephemeral`) | nativ | **nicht offiziell dokumentiert** — siehe Risiko-Hinweis unten |
| Rate-Limit | Tier-abhängig | 500 RPM / 60.000 TPM pro Workspace |

### Was Langdock NICHT abdeckt — sei dir bewusst

1. **EU AI Act**: Langdock vermarktet keine explizite EU-AI-Act-Konformität. Coaching-Tools, die in HR-Entscheidungen einfließen, können als _High-Risk_ klassifiziert werden — das ist eine Rechtsfrage, kein Provider-Feature. Hol dir bei Bedarf juristische Einschätzung.
2. **DORA (Digital Operational Resilience Act)**: Nicht explizit von Langdock beworben. ISO 27001 + Pen-Tests helfen, ersetzen aber kein DORA-Audit. Wenn du Finanzdienstleistungen anbietest, sprich Langdock-Sales an und klär die DORA-Subprocessor-Pflichten.
3. **Supabase + Resend bleiben außerhalb von Langdock**. DB liegt aktuell in Supabase eu-west-2 (London). Resend ist US-basiert. Vollständige EU-Architektur erfordert auch da einen Wechsel — separat zu betrachten.
4. **Prompt-Caching-Risiko**: Anthropic-Direkt unterstützt `cache_control: { type: 'ephemeral' }` und spart damit bei wiederholten System-Prompt-Blöcken 5–10× Tokens. Langdock dokumentiert dieses Feature nicht. Der Code sendet es weiter (Annahme: Langdock proxy't transparent durch), aber das ist **nicht bestätigt**. Nach dem Wechsel unbedingt die Token-Telemetrie checken (siehe Schritt 8).

## Schritt 1 — Workspace anlegen

1. Gehe auf [langdock.com](https://langdock.com) → **Get started**.
2. Wähle eine **Region** beim Workspace-Setup: **EU (Frankfurt)** für DSGVO-First-Hosting.
3. Verifiziere deine Mailadresse.

## Schritt 2 — AVV (Auftragsverarbeitungsvertrag) unterzeichnen

1. **Workspace-Settings → Compliance → Data Processing Agreement**.
2. Lies den AVV-Text durch (Standard nach Art. 28 DSGVO).
3. Unterzeichne digital. Speichere dir die PDF lokal — du brauchst sie für dein eigenes Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) und für eine ggf. notwendige Datenschutz-Folgenabschätzung (DSFA, Art. 35 DSGVO) bei Coaching-Daten.

## Schritt 3 — Modelle freischalten

1. **Workspace-Settings → Models** (oder ähnlich — UI kann sich ändern).
2. Aktiviere die drei Modelle, die der Deepling nutzt:
   - **Claude Sonnet 4.6** (Coach-Dialoge — Sweetspot Latenz/Qualität)
   - **Claude Opus 4.7** (Profil-Auswertung — einmalig pro User, mehr Tiefe)
   - **Claude Haiku 4.5** (Memory-Extraktor pro Coach-Turn — schnell, billig)
3. Notiere die genauen Modell-IDs, die Langdock dir in deinem Workspace zeigt. Die offizielle Doc nennt z. B. `claude-sonnet-4-6-default` und `claude-sonnet-4-20250514` — die Liste ist Workspace-spezifisch.
4. Verifizieren via Terminal (sobald du den API-Key hast):
   ```bash
   curl -H "Authorization: Bearer <DEIN_LANGDOCK_KEY>" \
        https://api.langdock.com/anthropic/eu/v1/models
   ```

## Schritt 4 — API-Key generieren

1. **Workspace-Settings → API Keys → Create Key**.
2. Gib dem Key einen Namen (z. B. `deepling-prod`).
3. Setze ggf. ein Ablaufdatum (Best Practice: max. 12 Monate, dann rotieren).
4. **Kopiere den Key SOFORT** — er wird nur einmal angezeigt.
5. Lege parallel einen zweiten Key `deepling-dev` an für lokale Entwicklung.

## Schritt 5 — Lokale `.env.local` setzen

In `/Users/lom/Developer/coachzwilling/.env.local`:

```bash
LLM_PROVIDER=langdock
LANGDOCK_API_KEY=ldk_xxxxxxxxxxxxxxxx     # dein dev-Key
LANGDOCK_REGION=eu

# Wenn die Default-Modell-IDs in deinem Workspace nicht existieren,
# hier die echten IDs aus Schritt 3 setzen:
# CLAUDE_COACH_MODEL=claude-sonnet-4-6-default
# CLAUDE_PROFILER_MODEL=claude-opus-4-7-default
# CLAUDE_MEMORY_MODEL=claude-haiku-4-5-default
```

`ANTHROPIC_API_KEY` kann leer bleiben — wird bei `LLM_PROVIDER=langdock` nicht gelesen.

## Schritt 6 — Vercel-Production-Env setzen

1. Vercel-Dashboard → **Project Settings → Environment Variables**.
2. Lege die Vars für **Production** an (nicht für Preview/Development, wenn du dort Anthropic-Direkt weiter testen willst):
   - `LLM_PROVIDER` = `langdock`
   - `LANGDOCK_API_KEY` = dein prod-Key (als **Sensitive** markieren — nicht mehr einsehbar nach Save)
   - `LANGDOCK_REGION` = `eu`
   - Modell-Overrides falls nötig
3. **Wichtig**: `ANTHROPIC_API_KEY` NICHT löschen — du brauchst ihn als Fallback, wenn du auf `LLM_PROVIDER=anthropic` zurückwillst.
4. Redeploy auslösen.

## Schritt 7 — Erstes manuelles Smoke-Test

```bash
curl -H "Authorization: Bearer $LANGDOCK_API_KEY" \
     -H "Content-Type: application/json" \
     https://api.langdock.com/anthropic/eu/v1/messages \
     -d '{
       "model": "claude-sonnet-4-6",
       "max_tokens": 50,
       "messages": [{"role": "user", "content": "Sag in einem Satz hallo."}]
     }'
```

Erwartete Antwort: JSON mit `content[0].text` und `usage.input_tokens` / `usage.output_tokens`. Falls Modell-ID 404: aus Schritt 3 die echte ID nehmen und nochmal probieren.

## Schritt 8 — Prompt-Caching verifizieren (kritisch)

Der Deepling spart Tokens durch `cache_control: ephemeral` auf dem Profil-Block. Bei Anthropic-Direkt sieht das in der `messages`-Tabelle so aus:

| Turn | `input_tokens` | `cache_creation_input_tokens` | `cache_read_input_tokens` |
|---|---|---|---|
| 1 (erster Call) | klein | ~6000 (Profil wird gecached) | 0 |
| 2 (zweiter Call) | klein | 0 | ~6000 (aus Cache gelesen) |
| 3+ | klein | 0 | ~6000 |

Nach dem Langdock-Switch:

1. Führe ein Onboarding durch (Profil wird generiert — Opus 4.7 Call).
2. Schicke 3–4 Nachrichten an den Coach (Sonnet 4.6 Calls).
3. SQL gegen Supabase:
   ```sql
   select role, input_tokens, cache_creation_input_tokens, cache_read_input_tokens, created_at
   from messages
   where role = 'assistant'
   order by created_at desc
   limit 5;
   ```
4. **Wenn `cache_read_input_tokens` ab Turn 2 grösser als 0 ist** → Caching funktioniert, Switch sauber.
5. **Wenn alle Cache-Felder NULL/0 bleiben** → Langdock strippt das Feld. Konsequenz: Token-Kosten steigen ca. 5–10× bei langen Profilen. Optionen:
   - Bei Langdock-Support nachfragen, ob Caching freigeschaltet werden kann
   - `system-prompt.ts` so anpassen, dass nur die kritischsten Blöcke gecached werden (kein 1:1-Vorteil, aber Schadensbegrenzung)
   - Auf `LLM_PROVIDER=bedrock` umstellen (AWS Bedrock unterstützt Caching offiziell)

## Schritt 9 — Rate-Limits prüfen

Langdock-Default: **500 Requests / Minute, 60.000 Tokens / Minute** pro Workspace.

Pro Coach-Antwort fallen typisch an:
- 1× Sonnet-Call (~3k–8k input, ~200–500 output)
- 1× Haiku-Memory-Extract pro Turn (~500 input, ~100 output)

Für 100 parallele User mit jeweils 1 Message/Minute landest du bei ~200 RPM und ~1 Mio TPM — TPM ist eng. Wenn du da Richtung kommst: Langdock-Sales kontaktieren für Tier-Upgrade.

## Schritt 10 — Logs + Monitoring

Langdock liefert ein eigenes Dashboard für Usage + Kosten:

- **Workspace → Analytics → Usage** zeigt Token-Verbrauch pro Modell pro Tag.
- **Workspace → Audit Log** zeigt alle API-Calls (für AVV-/DSGVO-Auditierbarkeit relevant).

Vergleich monatlich mit der Anthropic-Direkt-Rechnung — Langdock hat einen Marge-Aufschlag (üblich 10–30 % je nach Tarif). Wenn das Coaching skaliert, lohnt ein Vergleich mit Bedrock (AWS-Pricing direkt + AWS-AVV).

## Rückweg — wenn was nicht funktioniert

Langdock zurückschalten:

```bash
# in Vercel-Env:
LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY bleibt gesetzt
```

Redeploy → läuft wieder direkt gegen Anthropic. Kein Code-Change nötig.

## Was im Code passiert (kurz)

- `src/lib/claude/client.ts` hat einen Provider-Switch (`LLM_PROVIDER`). Bei `langdock` wird der Anthropic-Client mit `authToken` (Bearer) und `baseURL` (`https://api.langdock.com/anthropic/<region>/v1`) konfiguriert.
- Das @anthropic-ai/sdk unterstützt das nativ — kein zweites SDK, kein zweiter Code-Pfad.
- Alle 11 LLM-Call-Sites im Repo (Profiler, Coach, Memory, Mini-Profile, Probe, Validator, Refine, Followup, Commitments, Repetition-Check, Chat-Stream) gehen über die zentrale `anthropic()`-Factory — funktionieren ohne Änderung.
- Modell-IDs sind über `CLAUDE_COACH_MODEL`, `CLAUDE_PROFILER_MODEL`, `CLAUDE_MEMORY_MODEL` überschreibbar, falls Langdock Workspace-spezifische Suffixe braucht.

## Quellen

- [Langdock Anthropic-API-Endpoint Docs](https://docs.langdock.com/api-endpoints/completion/anthropic)
- [Langdock Trust Center](https://trust.langdock.com/)
- [Langdock Security Overview](https://langdock.com/security)
- [Langdock Changelog](https://langdock.com/changelog)
