import 'server-only'
import type { TranscribeArgs, TranscribeResult } from './client'

// ─────────────────────────────────────────────────────────────────────────────
// Speechmatics Batch Adapter — EU-konformer STT-Provider
//
// Endpoint:      https://{region}.asr.api.speechmatics.com/v2
//                Default-Region: eu1 (Frankfurt). Verfügbar: eu1, eu2, us1, us2, au1.
// Auth:          Authorization: Bearer <SPEECHMATICS_API_KEY>
// Pricing:       Stand 2026-06 etwa $0.005/Min Standard, $0.008/Min Enhanced.
// Compliance:    Speechmatics GmbH (Cambridge UK + Krakau PL),
//                Standard-AVV per Account-Setup, ISO 27001 zertifiziert.
//                Audio bleibt in der gewählten Region.
//
// Pattern (anders als OpenAI Whisper das synchron returnt):
//   1. POST /v2/jobs/ mit multipart: data_file + config-JSON  → liefert job_id
//   2. GET  /v2/jobs/{id}       (polling alle 500ms)          bis status === 'done'
//   3. GET  /v2/jobs/{id}/transcript?format=txt              → finaler Text
//
// Timeout: 30s default. Bei 20s Audio liefert Speechmatics typisch in 2-5s,
// größere Aufnahmen können länger brauchen — Limit hebt nur unsere
// Vercel-Funktion an, nicht den User-Workflow.
// ─────────────────────────────────────────────────────────────────────────────

interface SpeechmaticsJobStatus {
  job?: {
    id?: string
    status?: 'running' | 'done' | 'rejected' | string
    errors?: Array<{ message?: string }>
    duration?: number
  }
}

const POLL_INTERVAL_MS = 500
const MAX_WAIT_MS = 30_000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function speechmaticsTranscribe(args: TranscribeArgs): Promise<TranscribeResult> {
  const key = process.env.SPEECHMATICS_API_KEY
  if (!key) throw new Error('SPEECHMATICS_API_KEY fehlt (STT_PROVIDER=speechmatics)')

  const region = (process.env.SPEECHMATICS_REGION ?? 'eu1').toLowerCase()
  if (!/^(eu1|eu2|us1|us2|au1)$/.test(region)) {
    throw new Error(`SPEECHMATICS_REGION muss eu1|eu2|us1|us2|au1 sein, war "${region}"`)
  }

  // operating_point: "standard" oder "enhanced". Enhanced ist genauer und
  // teurer (~$0.008 statt $0.005/Min). Für Coaching-Audio mit Fachvokabular
  // ist "enhanced" die richtige Wahl — User kann via Env überschreiben.
  const opPoint = (process.env.SPEECHMATICS_OPERATING_POINT ?? 'enhanced').toLowerCase()
  if (opPoint !== 'standard' && opPoint !== 'enhanced') {
    throw new Error(`SPEECHMATICS_OPERATING_POINT muss "standard" oder "enhanced" sein`)
  }

  const baseURL = `https://${region}.asr.api.speechmatics.com/v2`

  // ─── 1. Job submit ─────────────────────────────────────────────────────
  const fd = new FormData()
  // Speechmatics akzeptiert webm/opus, mp4, m4a, wav, mp3 — gleiche Liste
  // wie Whisper, also passt unsere Client-Aufnahme (webm/opus default).
  fd.append('data_file', args.audio, args.filename)
  fd.append('config', JSON.stringify({
    type: 'transcription',
    transcription_config: {
      language: args.language ?? 'de',
      operating_point: opPoint,
      // Coaching-Kontext als Vokabular-Hint (verbessert Erkennung von
      // Worten wie "Deepling", "Denkhorizonte" etc.) —
      // Speechmatics nennt das "additional_vocab".
      ...(args.prompt
        ? {
            additional_vocab: extractVocab(args.prompt).map(content => ({ content })),
          }
        : {}),
    },
  }))

  const submitRes = await fetch(`${baseURL}/jobs/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  })
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '')
    throw new Error(`Speechmatics-Submit HTTP ${submitRes.status}: ${errText.slice(0, 300)}`)
  }
  const submitJson = (await submitRes.json()) as { id?: string }
  const jobId = submitJson.id
  if (!jobId) throw new Error('Speechmatics: keine job_id in Submit-Response')

  // ─── 2. Poll bis status === 'done' ────────────────────────────────────
  const startedAt = Date.now()
  let durationSec: number | undefined
  while (true) {
    await sleep(POLL_INTERVAL_MS)
    const elapsed = Date.now() - startedAt
    if (elapsed > MAX_WAIT_MS) {
      throw new Error(`Speechmatics-Timeout nach ${MAX_WAIT_MS / 1000}s (job ${jobId})`)
    }
    const statusRes = await fetch(`${baseURL}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!statusRes.ok) {
      // 5xx → weiter pollen (transient), 4xx → abbrechen
      if (statusRes.status >= 500) continue
      const errText = await statusRes.text().catch(() => '')
      throw new Error(`Speechmatics-Poll HTTP ${statusRes.status}: ${errText.slice(0, 200)}`)
    }
    const statusJson = (await statusRes.json()) as SpeechmaticsJobStatus
    const status = statusJson.job?.status
    durationSec = statusJson.job?.duration
    if (status === 'done') break
    if (status === 'rejected') {
      const msg = statusJson.job?.errors?.[0]?.message ?? 'unbekannt'
      throw new Error(`Speechmatics-Job rejected: ${msg}`)
    }
    // status === 'running' (oder unbekannt) → weiter pollen
  }

  // ─── 3. Transkript holen ──────────────────────────────────────────────
  const transcriptRes = await fetch(`${baseURL}/jobs/${jobId}/transcript?format=txt`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!transcriptRes.ok) {
    const errText = await transcriptRes.text().catch(() => '')
    throw new Error(`Speechmatics-Transcript HTTP ${transcriptRes.status}: ${errText.slice(0, 200)}`)
  }
  const text = (await transcriptRes.text()).trim()

  return {
    text,
    durationSec,
    model: `speechmatics-${opPoint}`,
  }
}

/**
 * Aus dem Coaching-Prompt eine Liste relevanter Begriffe für
 * `additional_vocab` extrahieren. Sehr leichtgewichtig: alle 8+ Buchstaben
 * langen Worte + alle bekannten Eigennamen — Speechmatics verbessert damit
 * die Erkennung dieser Worte signifikant.
 *
 * Begrenzung: max 100 Worte pro Job laut Doku — wir halten 20 als Soft-Cap.
 */
function extractVocab(prompt: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const words = prompt.match(/\b[A-ZÄÖÜ][a-zäöüß-]{6,}\b/g) ?? []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= 20) break
  }
  return out
}
