import 'server-only'
import { sendEmail } from './resend'

/**
 * Interne Betreiber-Benachrichtigung: ein Nutzer hat das Onboarding
 * abgeschlossen und ein neues Coach-Profil ist fertig. Lom/Michael bekommen
 * eine Mail, damit sie direkt das PDF erstellen + versenden können.
 *
 * Empfänger: ADMIN_NOTIFY_EMAIL (Default: kontakt@deepling.de — leitet via
 * IONOS an Lom + Michael weiter). Best-effort: ein Fehler hier darf das
 * Onboarding NIEMALS blockieren (Aufrufer wrappt in try/catch).
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de').replace(/\/$/, '')

function notifyRecipient(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || 'kontakt@deepling.de'
}

export async function notifyAdminsNewProfile(args: {
  name: string | null
  email: string
  userId: string
}): Promise<void> {
  const who = args.name ? `${args.name} (${args.email})` : args.email
  const adminUrl = `${APP_URL}/admin`

  const bodyText = [
    `${who} hat den Fragebogen abgeschlossen — ein neues Coach-Profil ist fertig.`,
    ``,
    `Jetzt kannst du das PDF erstellen und versenden.`,
    `Admin-Übersicht: ${adminUrl}`,
  ].join('\n')

  const bodyHtml = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#111">
    <p style="margin:0 0 12px"><strong>${escapeHtml(who)}</strong> hat den Fragebogen abgeschlossen — ein neues Coach-Profil ist fertig.</p>
    <p style="margin:0 0 18px">Jetzt kannst du das PDF erstellen und versenden.</p>
    <p style="margin:0"><a href="${adminUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Zur Admin-Übersicht →</a></p>
  </div>`

  await sendEmail({
    to: notifyRecipient(),
    subject: `🎉 Neues Deepling-Profil: ${args.name ?? args.email}`,
    bodyHtml,
    bodyText,
    // Interne Alert-Mail — kein echtes Abo. List-Unsubscribe zeigt nur auf die
    // Admin-Seite (Pflichtfeld der sendEmail-Signatur).
    unsubscribeUrl: adminUrl,
    // Innerhalb 24h pro Nutzer deduplizieren → kein Spam bei Finalize-Retries.
    idempotencyKey: `new-profile-${args.userId}`,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
