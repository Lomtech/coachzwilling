import 'server-only'

/**
 * Resend Email Client (kein SDK — direkter HTTP-Call).
 *
 * Warum kein SDK:
 * - Zusätzliche Dependency
 * - HTTP-API ist trivial (1 POST mit JSON)
 * - Wir wollen volle Kontrolle über Headers (List-Unsubscribe, Idempotency-Key)
 *
 * Rate-Limit:
 * - 5 req/sec per Team auf allen Plans
 * - Bei 429: retry-after-Header respektieren (in Sekunden)
 *
 * One-Click-Unsubscribe (RFC 8058):
 * - List-Unsubscribe-Header MUSS einen POST-Endpunkt enthalten
 * - Gmail/Outlook posten asynchron dorthin OHNE Auth → muss public-accessible sein
 * - List-Unsubscribe-Post: "List-Unsubscribe=One-Click" signalisiert RFC 8058
 */

interface SendEmailArgs {
  to: string
  subject: string
  bodyHtml: string
  bodyText: string
  // Token für /api/followups/unsubscribe/[token] — Gmail postet beim Klick dorthin
  unsubscribeUrl: string
  // Idempotenz: gleicher Key innerhalb 24h dedupliziert
  idempotencyKey?: string
  // Reply-To (Default: kein Reply, später ggf. Postmark-Inbox)
  replyTo?: string
  // Override absender — Default ist EMAIL_FROM aus env
  from?: string
}

export interface SendResult {
  ok: boolean
  resendMessageId?: string
  error?: string
  statusCode?: number
  retryAfterSec?: number
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function defaultFrom(): string {
  // EMAIL_FROM = "Coach <hello@coachzwilling.com>"
  // Fallback auf resend.dev-Testdomain, damit Dev/Staging ohne DNS-Setup geht.
  return process.env.EMAIL_FROM ?? 'Coaching-Zwilling <onboarding@resend.dev>'
}

export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'RESEND_API_KEY missing in env. Set in Vercel Project Settings.',
    }
  }

  const body = {
    from: args.from ?? defaultFrom(),
    to: [args.to],
    subject: args.subject,
    html: args.bodyHtml,
    text: args.bodyText,
    reply_to: args.replyTo,
    headers: {
      // One-Click-Unsubscribe (RFC 8058) — Gmail/Outlook UI zeigt "Abbestellen"-Button
      'List-Unsubscribe': `<${args.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey ?? crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') ?? '60')
    return { ok: false, statusCode: 429, retryAfterSec: retryAfter, error: 'rate-limited' }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error('[resend] send failed', res.status, errBody.slice(0, 500))
    return { ok: false, statusCode: res.status, error: `Resend ${res.status}: ${errBody.slice(0, 200)}` }
  }

  const json = (await res.json()) as { id?: string }
  return { ok: true, resendMessageId: json.id }
}
