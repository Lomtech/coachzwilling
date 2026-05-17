import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

// ─────────────────────────────────────────────────────────────────────────────
// LLM-Provider-Abstraktion
//
//   LLM_PROVIDER=anthropic  (default)  → Direkt-API von Anthropic (USA)
//   LLM_PROVIDER=bedrock              → AWS Bedrock (eu-central-1, Frankfurt)
//
// Beide Provider sprechen die gleiche Anthropic-Messages-API — der Code in
// profiler.ts / memory.ts / chat-route.ts bleibt unverändert.
// ─────────────────────────────────────────────────────────────────────────────

// AnthropicBedrock und Anthropic haben dasselbe messages-Interface, aber
// TypeScript sieht sie als verschiedene Klassen. Wir typisieren auf Anthropic
// und casten Bedrock entsprechend — funktional identisch zur Laufzeit.
let _client: Anthropic | null = null

export function anthropic(): Anthropic {
  if (_client) return _client

  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase()

  if (provider === 'bedrock') {
    // AWS-Credentials via Standard-Mechanismus:
    //   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  → env vars
    //   AWS_REGION                                  → 'eu-central-1' (Frankfurt)
    const region = process.env.AWS_REGION ?? 'eu-central-1'
    _client = new AnthropicBedrock({ awsRegion: region }) as unknown as Anthropic
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
// Werden via env vars überschrieben — Defaults passen zum aktiven Provider.

function modelFor(envVarName: string, anthropicDefault: string, bedrockDefault: string): string {
  const v = process.env[envVarName]
  if (v) return v
  return process.env.LLM_PROVIDER?.toLowerCase() === 'bedrock' ? bedrockDefault : anthropicDefault
}

export const COACH_MODEL = modelFor(
  'CLAUDE_COACH_MODEL',
  'claude-sonnet-4-6',
  'eu.anthropic.claude-sonnet-4-6-20260101-v1:0'
)

export const PROFILER_MODEL = modelFor(
  'CLAUDE_PROFILER_MODEL',
  'claude-opus-4-7',
  'eu.anthropic.claude-opus-4-7-20260101-v1:0'
)

export const MEMORY_MODEL = modelFor(
  'CLAUDE_MEMORY_MODEL',
  'claude-haiku-4-5',
  'eu.anthropic.claude-haiku-4-5-20260101-v1:0'
)
