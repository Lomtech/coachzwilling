import 'server-only'
import { sendEmail } from './resend'

/**
 * Nutzer-Mails (im Gegensatz zu admin-notify.ts = Betreiber-Mails).
 *
 * „Dein Profil ist fertig" — geht raus, sobald das Onboarding durch ist und
 * das Coach-Profil steht. Enthält den Link auf /mein-profil (Kurz-Profil im
 * Deep-Space-Design), das der Nutzer per Cmd/Strg+P als PDF sichern kann.
 *
 * Best-effort: ein Fehler hier darf das Onboarding NIE blockieren.
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://deepling.de').replace(/\/$/, '')

function firstNameOf(full: string | null | undefined): string | null {
  const f = (full ?? '').trim().split(/\s+/)[0]
  return f || null
}

export async function sendUserProfileReady(args: {
  email: string
  name: string | null
  userId: string
}): Promise<void> {
  const first = firstNameOf(args.name)
  const hello = first ? `Hallo ${first},` : 'Hallo,'
  const profileUrl = `${APP_URL}/mein-profil`
  const coachUrl = `${APP_URL}/coach`

  const bodyText = [
    hello,
    ``,
    `dein Profil ist fertig. Es ist aus deinen Antworten entstanden — deine Kernmuster und dein blinder Fleck, in deinen eigenen Worten.`,
    ``,
    `Dein Kurz-Profil ansehen: ${profileUrl}`,
    `(Als PDF speichern: die Seite öffnen und Cmd+P bzw. Strg+P drücken.)`,
    ``,
    `Danach wartet dein Coach auf dich: ${coachUrl}`,
    ``,
    `Vertraulich — nur zwischen euch beiden.`,
  ].join('\n')

  const bodyHtml = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#211f1c;max-width:520px">
    <p style="margin:0 0 14px">${escapeHtml(hello)}</p>
    <p style="margin:0 0 14px">dein Profil ist fertig. Es ist aus deinen Antworten entstanden — <strong>deine Kernmuster und dein blinder Fleck</strong>, in deinen eigenen Worten.</p>
    <p style="margin:0 0 22px">
      <a href="${profileUrl}" style="display:inline-block;background:#d0642c;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Dein Kurz-Profil ansehen →</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#9a8f80">Tipp: Seite öffnen und <strong>Cmd+P</strong> (Mac) bzw. <strong>Strg+P</strong> drücken — dann hast du es als PDF.</p>
    <p style="margin:0 0 14px">Danach wartet dein Coach auf dich: <a href="${coachUrl}" style="color:#d0642c">${coachUrl.replace(/^https?:\/\//, '')}</a></p>
    <p style="margin:24px 0 0;font-size:12px;color:#9a8f80">Vertraulich — nur zwischen euch beiden.</p>
  </div>`

  await sendEmail({
    to: args.email,
    subject: first ? `${first}, dein Deepling-Profil ist fertig` : 'Dein Deepling-Profil ist fertig',
    bodyHtml,
    bodyText,
    unsubscribeUrl: `${APP_URL}/settings`,
    // Pro Nutzer innerhalb 24h deduplizieren → kein Doppel bei Finalize-Retries.
    idempotencyKey: `profile-ready-${args.userId}`,
  })
}

/**
 * Passwort-zurücksetzen — bewusst über UNSERE Resend-Infrastruktur, nicht über
 * Supabases eingebauten Mailer. Dessen Standard-Absender + Vorlage sahen für
 * Empfänger nach Spam aus (Nutzer-Feedback 2026-07-20). Hier kommt die Mail als
 * „Deepling <no-reply@deepling.de>" (verifizierte Domain, SPF/DKIM/DMARC).
 *
 * KEINE Idempotenz-Deduplizierung: wer zweimal auf „zurücksetzen" klickt, muss
 * auch die zweite Mail bekommen — sonst wartet er auf etwas, das nie kommt.
 */
export async function sendPasswordReset(args: {
  email: string
  name: string | null
  actionLink: string
}): Promise<void> {
  const first = firstNameOf(args.name)
  const hello = first ? `Hallo ${first},` : 'Hallo,'

  const bodyText = [
    hello,
    ``,
    `du hast angefordert, dein Deepling-Passwort zurückzusetzen. Über diesen Link vergibst du ein neues:`,
    ``,
    args.actionLink,
    ``,
    `Der Link gilt 60 Minuten und lässt sich nur einmal verwenden.`,
    ``,
    `Du hast das nicht angefordert? Dann ignoriere diese Mail einfach — dein Passwort bleibt unverändert.`,
    ``,
    `Deepling`,
  ].join('\n')

  const bodyHtml = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#211f1c;max-width:520px">
    <p style="margin:0 0 14px">${escapeHtml(hello)}</p>
    <p style="margin:0 0 14px">du hast angefordert, dein <strong>Deepling</strong>-Passwort zurückzusetzen. Über den Knopf vergibst du ein neues:</p>
    <p style="margin:0 0 22px">
      <a href="${args.actionLink}" style="display:inline-block;background:#d0642c;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Neues Passwort vergeben →</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#9a8f80">Der Link gilt 60 Minuten und lässt sich nur einmal verwenden.</p>
    <p style="margin:0 0 14px;font-size:13px;color:#9a8f80">Du hast das nicht angefordert? Dann ignoriere diese Mail einfach — dein Passwort bleibt unverändert.</p>
    <p style="margin:24px 0 0;font-size:12px;color:#9a8f80">Vertraulich — nur zwischen euch beiden.</p>
  </div>`

  await sendEmail({
    to: args.email,
    subject: 'Dein Deepling-Passwort zurücksetzen',
    bodyHtml,
    bodyText,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
