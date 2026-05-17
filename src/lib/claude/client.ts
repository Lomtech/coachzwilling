import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

let _anthropic: Anthropic | null = null

export function anthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt')
    _anthropic = new Anthropic({ apiKey: key })
  }
  return _anthropic
}

export const COACH_MODEL =
  process.env.CLAUDE_COACH_MODEL ?? 'claude-sonnet-4-6'
export const PROFILER_MODEL =
  process.env.CLAUDE_PROFILER_MODEL ?? 'claude-opus-4-7'
