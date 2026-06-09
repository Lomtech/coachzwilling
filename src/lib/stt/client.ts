import 'server-only'

// ─────────────────────────────────────────────────────────────────────────────
// Speech-to-Text Adapter — provider-agnostisch.
//
// Kontext (Stand 2026-06):
//   • Langdock proxy't Anthropic/OpenAI/Mistral/Google Chat-Completions
//     + Embeddings + Knowledge — aber KEIN Audio-/Whisper-Endpoint
//     (verifiziert via https://docs.langdock.com/llms.txt).
//   • Damit gibt es keine "DSGVO-First-Lösung" über den Langdock-Account.
//
// Provider-Optionen:
//   STT_PROVIDER=openai      OpenAI Whisper direkt — US-Hosting, einfaches Setup.
//                            Bricht die strikte EU-Datenflusslogik wenn du sonst
//                            alles über Langdock fährst — bewusste Entscheidung
//                            des Betreibers nötig.
//   STT_PROVIDER=disabled    Feature aus — UI bietet keinen Whisper-Fallback an.
//                            Default wenn nichts gesetzt UND kein OPENAI_API_KEY.
//
// Erweiterbarkeit:
//   Für EU-konforme STT-Provider (Speechmatics, Deepgram EU-Region,
//   self-hosted Whisper auf Hetzner) kann hier ein neuer Branch ergänzt werden
//   — gleiche Adapter-Signatur, der Rest des Codes bleibt unverändert.
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscribeArgs {
  /** Audio-Daten als Blob/Buffer. Erlaubte Container: webm/opus, mp4, m4a, wav, mp3. */
  audio: Blob
  /** Originalname für die Whisper-API (Endung bestimmt mime-Hint). */
  filename: string
  /** ISO-639-1 Sprache, optional — verbessert die Genauigkeit drastisch. */
  language?: string
  /** Optionaler Kontext-Prompt (z.B. Coaching-Vokabular) für besseres Vokabular-Matching. */
  prompt?: string
}

export interface TranscribeResult {
  text: string
  /** Sekunden Audio-Länge laut Provider (falls geliefert). Für Telemetrie/Kosten. */
  durationSec?: number
  /** Provider-Modell-Identifier (z.B. "whisper-1"). */
  model: string
}

export type SttProviderId = 'openai' | 'disabled'

export function sttProvider(): SttProviderId {
  const explicit = (process.env.STT_PROVIDER ?? '').toLowerCase()
  if (explicit === 'openai' || explicit === 'disabled') return explicit
  // Implicit-Default: wenn OPENAI_API_KEY gesetzt ist und nichts widerspricht,
  // gehen wir davon aus, dass der Betreiber Whisper via OpenAI nutzen will.
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'disabled'
}

export function isSttEnabled(): boolean {
  return sttProvider() !== 'disabled'
}

export async function transcribe(args: TranscribeArgs): Promise<TranscribeResult> {
  const provider = sttProvider()
  if (provider === 'disabled') {
    throw new Error('STT-Provider nicht konfiguriert (STT_PROVIDER=disabled)')
  }
  if (provider === 'openai') {
    const { openaiTranscribe } = await import('./openai')
    return openaiTranscribe(args)
  }
  // Exhaustive check — wenn neue Provider-IDs hinzukommen, soll TypeScript hier
  // schreien. Aktuell unerreichbar.
  const _exhaustive: never = provider
  throw new Error(`Unbekannter STT_PROVIDER: ${String(_exhaustive)}`)
}
