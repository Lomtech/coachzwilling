import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

// ─────────────────────────────────────────────────────────────────────────────
// LLM-Provider-Abstraktion
//
//   LLM_PROVIDER=anthropic  (default)  → Direkt-API von Anthropic (USA)
//   LLM_PROVIDER=bedrock              → AWS Bedrock (eu-central-1, Frankfurt)
//   LLM_PROVIDER=langdock             → Langdock (EU- oder US-Hosting,
//                                       DSGVO-konform, ISO 27001 / SOC 2 Type II,
//                                       Daten in der EU; AVV über Langdock-Account)
//
// Alle drei Provider sprechen das Anthropic-Messages-API-Wire-Format — der Code
// in profiler.ts / memory.ts / chat-route.ts bleibt unverändert.
//
// Wichtige Hinweise zu Langdock:
//   • Endpoint:        https://api.langdock.com/anthropic/{region}/v1
//                      ({region} = "eu" oder "us"; Default "eu")
//   • Auth-Header:     Authorization: Bearer <LANGDOCK_API_KEY>
//                      (nicht x-api-key wie bei Anthropic-Direkt)
//   • Modell-IDs:      hängen vom Workspace ab. Die offizielle Doc nennt
//                      Beispiele wie "claude-sonnet-4-6-default" oder
//                      "claude-sonnet-4-20250514". Liste abrufbar via
//                      GET /anthropic/{region}/v1/models — eigene IDs
//                      bei Bedarf über CLAUDE_*_MODEL Env-Vars überschreiben.
//   • Rate-Limits:     500 RPM / 60.000 TPM auf Workspace-Ebene (Stand 2026-06).
//   • Prompt-Caching:  Langdock dokumentiert cache_control nicht explizit.
//                      Da das Wire-Format Anthropic-kompatibel ist und Langdock
//                      die Felder an das Backend weiterreicht, sollte
//                      `cache_control: ephemeral` funktionieren —
//                      verifizieren über usage.cache_read_input_tokens
//                      in der messages-Tabelle. Wenn 0 → kein Caching aktiv
//                      → Token-Kosten steigen 5–10× bei langem Profil.
// ─────────────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'bedrock' | 'langdock'

function provider(): Provider {
  const v = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase()
  if (v === 'bedrock' || v === 'langdock' || v === 'anthropic') return v
  throw new Error(`Unbekannter LLM_PROVIDER: "${v}". Erlaubt: anthropic | bedrock | langdock`)
}

// AnthropicBedrock und Anthropic haben dasselbe messages-Interface, aber
// TypeScript sieht sie als verschiedene Klassen. Wir typisieren auf Anthropic
// und casten Bedrock entsprechend — funktional identisch zur Laufzeit.
let _client: Anthropic | null = null

export function anthropic(): Anthropic {
  if (_client) return _client

  const p = provider()

  if (p === 'bedrock') {
    // AWS-Credentials via Standard-Mechanismus:
    //   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  → env vars
    //   AWS_REGION                                  → 'eu-central-1' (Frankfurt)
    const region = process.env.AWS_REGION ?? 'eu-central-1'
    _client = new AnthropicBedrock({ awsRegion: region }) as unknown as Anthropic
    return _client
  }

  if (p === 'langdock') {
    const key = process.env.LANGDOCK_API_KEY
    if (!key) throw new Error('LANGDOCK_API_KEY fehlt (LLM_PROVIDER=langdock)')
    const region = (process.env.LANGDOCK_REGION ?? 'eu').toLowerCase()
    if (region !== 'eu' && region !== 'us') {
      throw new Error(`LANGDOCK_REGION muss "eu" oder "us" sein, war "${region}"`)
    }
    const baseURL = process.env.LANGDOCK_BASE_URL
      ?? `https://api.langdock.com/anthropic/${region}/v1`

    // Langdock erwartet `Authorization: Bearer <key>` statt `x-api-key`.
    // Das offizielle @anthropic-ai/sdk unterstützt das über die `authToken`-
    // Option — keine custom-Headers-Patcherei nötig. apiKey muss explizit
    // null sein, sonst beschwert sich das SDK über doppelte Auth-Methoden.
    _client = new Anthropic({
      apiKey: null,
      authToken: key,
      baseURL,
    })
    return _client
  }

  // Default: Direkt-Anthropic
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY fehlt')
  _client = new Anthropic({ apiKey: key })
  return _client
}

// ─── Modell-IDs ───────────────────────────────────────────────────────────
// Bedrock erwartet längere IDs (mit Cross-Region-Inference-Prefix `eu.`).
// Langdock kann je nach Workspace andere Suffixe brauchen — siehe Hinweis oben.
// Werden via env vars überschrieben — Defaults passen zum aktiven Provider.

function modelFor(
  envVarName: string,
  anthropicDefault: string,
  bedrockDefault: string,
  langdockDefault: string,
): string {
  const v = process.env[envVarName]
  if (v) return v
  switch (provider()) {
    case 'bedrock': return bedrockDefault
    case 'langdock': return langdockDefault
    default: return anthropicDefault
  }
}

export const COACH_MODEL = modelFor(
  'CLAUDE_COACH_MODEL',
  'claude-sonnet-4-6',
  'eu.anthropic.claude-sonnet-4-6-20260101-v1:0',
  // Langdock: aus der offiziellen Doc, Stand 2026-06. Bei Bedarf via Env
  // überschreiben — die echte Liste ist Workspace-spezifisch
  // (GET /anthropic/{region}/v1/models).
  'claude-sonnet-4-6-default',
)

export const PROFILER_MODEL = modelFor(
  'CLAUDE_PROFILER_MODEL',
  'claude-opus-4-7',
  'eu.anthropic.claude-opus-4-7-20260101-v1:0',
  'claude-opus-4-7-default',
)

export const MEMORY_MODEL = modelFor(
  'CLAUDE_MEMORY_MODEL',
  'claude-haiku-4-5',
  'eu.anthropic.claude-haiku-4-5-20260101-v1:0',
  'claude-haiku-4-5-default',
)
