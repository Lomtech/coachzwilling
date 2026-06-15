import 'server-only'
import { sendEmail, type SendResult } from '@/lib/email/resend'

interface OrgInviteMailArgs {
  to: string
  orgName: string
  inviterName: string | null
  inviterEmail: string
  role: 'member' | 'hr_admin'
  acceptUrl: string
  expiresAt: Date
}

/**
 * Versendet eine Org-Einladung. Plain Text + minimales HTML (kein Marketing-
 * Look — eine sachliche Geschäftsmail, weil die meisten Empfänger HR sind).
 */
export async function sendOrgInviteMail(args: OrgInviteMailArgs): Promise<SendResult> {
  const inviter = args.inviterName ? `${args.inviterName} (${args.inviterEmail})` : args.inviterEmail
  const roleLabel = args.role === 'hr_admin' ? 'HR-Admin' : 'Mitglied'
  const expires = args.expiresAt.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })

  const subject = `Einladung: ${args.orgName} — Deepling`

  const bodyText = [
    `Hallo,`,
    ``,
    `${inviter} lädt dich ein, der Organisation „${args.orgName}" im`,
    `Deepling als ${roleLabel} beizutreten.`,
    ``,
    `Einladung annehmen:`,
    args.acceptUrl,
    ``,
    `Der Link ist gültig bis ${expires}. Falls du keinen Account hast, kannst`,
    `du dich nach dem Klick direkt registrieren — die Einladung wird beim`,
    `nächsten Login automatisch eingelöst.`,
    ``,
    `Wenn du diese Einladung nicht erwartest, ignoriere die E-Mail einfach.`,
    ``,
    `— Deepling`,
  ].join('\n')

  const bodyHtml = `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; color: #1a1d24; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>Hallo,</p>
  <p><strong>${escapeHtml(inviter)}</strong> lädt dich ein, der Organisation
  <strong>${escapeHtml(args.orgName)}</strong> im Deepling als
  <strong>${roleLabel}</strong> beizutreten.</p>
  <p style="margin: 32px 0;">
    <a href="${args.acceptUrl}" style="display: inline-block; background: #1a1d24; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 500;">
      Einladung annehmen
    </a>
  </p>
  <p style="color: #4a4f5b; font-size: 14px;">
    Der Link ist gültig bis ${expires}. Falls du keinen Account hast, kannst
    du dich nach dem Klick direkt registrieren — die Einladung wird beim
    nächsten Login automatisch eingelöst.
  </p>
  <p style="color: #8a8f9a; font-size: 12px; margin-top: 32px;">
    Wenn du diese Einladung nicht erwartest, ignoriere die E-Mail einfach.
  </p>
</body></html>`

  return sendEmail({
    to: args.to,
    subject,
    bodyText,
    bodyHtml,
    // List-Unsubscribe ist für Org-Einladungen nicht relevant (Transactional
    // Mail, kein Marketing), aber Resend braucht einen Wert. Verlinkt einfach
    // auf die accept-Page mit ?decline=1 → Route handled das.
    unsubscribeUrl: `${args.acceptUrl}?decline=1`,
    idempotencyKey: `org-invite-${args.acceptUrl}`,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  )
}
