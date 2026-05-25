import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Signed Tokens für Email-Links (Click-Tracking, Unsubscribe).
 *
 * Statt JWT/jose-Dependency: HMAC-SHA256 mit FOLLOWUP_SECRET.
 * Payload-Format: `<userId>|<purpose>|<followupId>|<expiresAt>` → base64url
 *                + "." + signature(base64url)
 *
 * Verify gibt das Payload zurück wenn:
 * - HMAC stimmt (timing-safe compare)
 * - expiresAt liegt in der Zukunft
 *
 * Sicherheit:
 * - Secret nie im Repo (env var)
 * - timingSafeEqual gegen timing-attacks
 * - Token enthält followupId → wir können in DB den Click loggen ohne weiteren auth-Pfad
 */

function getSecret(): string {
  const s = process.env.FOLLOWUP_SECRET
  if (!s) {
    // Fallback: deterministisch aus SUPABASE_SERVICE_ROLE_KEY ableiten,
    // damit Dev/Preview ohne extra Env-Var funktionieren.
    const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!fallback) throw new Error('FOLLOWUP_SECRET (oder SUPABASE_SERVICE_ROLE_KEY) muss gesetzt sein')
    return fallback
  }
  return s
}

export type TokenPurpose = 'click' | 'unsubscribe'

interface TokenPayload {
  userId: string
  followupId: string
  purpose: TokenPurpose
  expiresAt: number   // ms epoch
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

export function signToken(args: {
  userId: string
  followupId: string
  purpose: TokenPurpose
  ttlMs?: number   // Default: 60 Tage
}): string {
  const exp = Date.now() + (args.ttlMs ?? 60 * 24 * 60 * 60 * 1000)
  const payload = `${args.userId}|${args.purpose}|${args.followupId}|${exp}`
  const sig = createHmac('sha256', getSecret()).update(payload).digest()
  return `${b64urlEncode(Buffer.from(payload, 'utf8'))}.${b64urlEncode(sig)}`
}

export function verifyToken(token: string): TokenPayload | null {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  try {
    const payloadEnc = token.slice(0, dot)
    const sigEnc = token.slice(dot + 1)
    const payloadBuf = b64urlDecode(payloadEnc)
    const sigBuf = b64urlDecode(sigEnc)
    const expected = createHmac('sha256', getSecret()).update(payloadBuf).digest()
    if (expected.length !== sigBuf.length || !timingSafeEqual(expected, sigBuf)) {
      return null
    }
    const [userId, purposeRaw, followupId, expStr] = payloadBuf.toString('utf8').split('|')
    if (!userId || !followupId || !expStr) return null
    if (purposeRaw !== 'click' && purposeRaw !== 'unsubscribe') return null
    const expiresAt = Number(expStr)
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
    return { userId, followupId, purpose: purposeRaw, expiresAt }
  } catch {
    return null
  }
}

/**
 * Zufalls-Token für die DB-Column signed_token (unique).
 * Wird genutzt um Replay-Attacks zusätzlich zu erschweren — selbst wenn
 * jemand die HMAC-Sig knackt, müsste das Token im DB-Eintrag stehen.
 */
export function generateRandomTokenId(): string {
  return randomBytes(16).toString('base64url')
}
