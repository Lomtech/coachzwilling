import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung',
  description: 'Datenschutzerklärung von Deepling — DSGVO-konform, EU-Hosting, transparente Sub-Processor-Liste.',
  alternates: { canonical: '/datenschutz' },
  robots: { index: true, follow: true },
}

interface Processor { name: string; desc: string; link?: string }

const PROCESSORS: Processor[] = [
  {
    name: 'Langdock GmbH',
    desc: 'KI-Vermittlungsschicht für Coach-Profil-Generation und Coach-Antworten. Vertragspartner: Langdock GmbH, Greifswalder Straße 212, 10405 Berlin, Deutschland. Ausführungsregion: EU/Frankfurt. Genutzte Modelle: Claude Sonnet 4.6 (Profiler + Coach) und Claude Haiku 4.5 (Followup-Komposition) — bereitgestellt durch Anthropic, durchgeleitet von Langdock. Zertifizierungen: ISO 27001, SOC 2 Type II. Auftragsverarbeitungsvertrag nach Art. 28 DSGVO mit Langdock besteht (einsehbar über das Langdock Trust Center). Langdock und sein Unter-Auftragsverarbeiter Anthropic verwenden API-Eingaben standardmäßig NICHT zum Modelltraining (Zero-Retention für Trainingszwecke); kurzfristige Speicherung erfolgt ausschließlich zur Missbrauchserkennung und wird anschließend gelöscht.',
    link: 'https://trust.langdock.com/',
  },
  {
    name: 'Supabase Inc.',
    desc: 'Datenbank, Authentifizierung. Datenstandort: London (UK, eu-west-2). Vertragspartner: Supabase Inc., USA. Schutzmaßnahme: EU-Angemessenheitsbeschluss 2021/1772 für UK (gültig bis 27.06.2031) sowie EU-Standardvertragsklauseln für die US-Vertragsbeziehung.',
    link: 'https://supabase.com/privacy',
  },
  {
    name: 'Resend, Inc.',
    desc: 'Versand transaktionaler E-Mails (Coach-Followup-Mails, Org-Einladungen). Ausführungsregion: Irland (eu-west-1). Vertragspartner: Resend, Inc., USA. Schutzmaßnahme: EU-Standardvertragsklauseln. Verarbeitet werden Empfänger-Adresse, Betreff, Inhalt und Zustellstatus zum Zweck der Mail-Übermittlung.',
    link: 'https://resend.com/legal/privacy-policy',
  },
  {
    name: 'IONOS SE',
    desc: 'Domain- und E-Mail-Hosting (deepling.de, lom@deepling.de, michael@deepling.de, kontakt@deepling.de). Vertragspartner: IONOS SE, Elgendorfer Straße 57, 56410 Montabaur, Deutschland. Datenstandort: Deutschland.',
    link: 'https://www.ionos.de/terms-gtc/terms-privacy/',
  },
  {
    name: 'Stripe Payments Europe Ltd. / Stripe Inc.',
    desc: 'Zahlungsabwicklung. Vertragspartner für EU-Nutzer: Stripe Payments Europe Ltd. (Irland). Daten können an Stripe Inc. (USA) übermittelt werden (EU-Standardvertragsklauseln + EU-US Data Privacy Framework, PCI-DSS-zertifiziert). Kartendaten werden nicht bei uns gespeichert.',
    link: 'https://stripe.com/de/privacy',
  },
  {
    name: 'Vercel Inc.',
    desc: 'Hosting der Webanwendung. Ausführungsregion: Frankfurt (fra1). Vertragspartner: Vercel Inc., USA. Schutzmaßnahme: EU-Standardvertragsklauseln + EU-US Data Privacy Framework.',
    link: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Google LLC',
    desc: 'Optionaler Login via Google-Konto (OAuth 2.0). Nur wenn du diesen Login-Weg explizit wählst, werden Name, E-Mail-Adresse und Google-Profil-ID übermittelt. Datenstandort: USA. Schutzmaßnahme: EU-Standardvertragsklauseln + EU-US Data Privacy Framework. Du kannst die Verbindung jederzeit in deinem Google-Konto widerrufen.',
    link: 'https://policies.google.com/privacy',
  },
]

export default function DatenschutzPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Datenschutzerklärung</h1>
      <p className="text-sm text-[var(--color-muted)] mb-10">Stand: Juni 2026</p>

      <div className="space-y-8 text-sm text-[var(--color-ink-2)] leading-relaxed">

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">1. Verantwortlicher</h2>
          <p className="mb-3">Verantwortlich für die Datenverarbeitung dieser Anwendung ist:</p>
          <div className="card space-y-1">
            <p className="font-semibold text-[var(--color-ink)]">Lom-Ali Imadaev</p>
            <p>Kreuzstraße 1</p>
            <p>82276 Adelshofen</p>
            <p>
              <a href="mailto:kontakt@deepling.de" className="text-[var(--color-accent)] underline">
                kontakt@deepling.de
              </a>
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">2. Welche Daten werden verarbeitet?</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Account-Daten: E-Mail-Adresse, Passwort-Hash (bzw. OAuth-Provider-ID bei Google-Login), Name (optional)</li>
            <li>Onboarding-Antworten der 50 Scan-Fragen (Freitext und Auswahl-Werte)</li>
            <li>Generiertes Coach-Profil (Markdown, basierend auf deinen Antworten)</li>
            <li>Chat-Verlauf mit dem KI-Coach (deine Nachrichten + Coach-Antworten + Zeitstempel)</li>
            <li>Token-Telemetrie pro Chat-Antwort (technische Metadaten zur Caching-Effizienz)</li>
            <li>Zahlungsdaten: ausschließlich Stripe-Customer-ID und Subscription-Status (keine Kartendaten bei uns)</li>
            <li>Technische Logs: IP-Adresse, User-Agent, Zeitstempel der Anfragen (Server-seitig 30 Tage zur Missbrauchsabwehr)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">3. Zweck der Verarbeitung</h2>
          <p>
            Die Daten werden verarbeitet, um (a) dein persönliches Coach-Profil zu erstellen,
            (b) dir individuelle Coach-Antworten zu liefern, die auf dein Profil zugeschnitten sind,
            (c) deine Chat-Historie für dich zugänglich zu halten und (d) die Abonnement-Abrechnung
            über Stripe abzuwickeln.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">4. Rechtsgrundlagen (DSGVO)</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> — Vertragserfüllung (Bereitstellung des Coachings, Zahlungsabwicklung)</li>
            <li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung (Registrierung, ggf. Google-Login)</li>
            <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> — berechtigte Interessen (technische Logs zur Missbrauchsabwehr)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">5. Übermittlung an die KI (besondere Aufmerksamkeit)</h2>
          <p className="mb-3">
            Damit dein KI-Coach individuell antworten kann, werden bei jeder Chat-Anfrage folgende Daten an{' '}
            <strong>Langdock GmbH (Deutschland, EU/Frankfurt)</strong> übermittelt: dein aktuell
            generiertes Coach-Profil (Markdown), der bisherige Chat-Verlauf dieses Gesprächs sowie deine
            neue Nachricht. Bei der erstmaligen Profil-Erstellung werden die 50 Scan-Antworten an
            Langdock gesendet. Langdock leitet die Anfrage an das Modell <strong>Claude Sonnet 4.6</strong>{' '}
            (Profiler und Coach) bzw. <strong>Claude Haiku 4.5</strong> (Followup-Komposition) des
            US-Anbieters <strong>Anthropic PBC</strong> weiter — als Unter-Auftragsverarbeiter im Sinne
            der DSGVO.
          </p>
          <p className="mb-3">
            <strong>DSGVO-Stand:</strong> Mit Langdock besteht ein Auftragsverarbeitungsvertrag nach
            Art. 28 DSGVO. Langdock ist nach ISO 27001 und SOC 2 Type II zertifiziert und hostet die
            Schnittstelle in der EU. Weder Langdock noch Anthropic verwenden API-Eingaben zum
            Modelltraining (Zero-Retention für Trainingszwecke). Eingaben werden bis zu 30 Tage zur
            Missbrauchserkennung gespeichert und anschließend gelöscht. Für die Weiterleitung an
            Anthropic (USA) durch Langdock gelten EU-Standardvertragsklauseln.
          </p>
          <p>
            <strong>Was du tun kannst:</strong> Du entscheidest selbst, welche Inhalte du im Chat
            preisgibst. Vermeide nach Möglichkeit Klarnamen Dritter, sensible Gesundheits- oder
            Finanzdaten. Du kannst dein Coach-Profil und deine Chat-Historie jederzeit in den
            Einstellungen löschen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">6. Auftragsverarbeiter / Drittanbieter</h2>
          <div className="space-y-3">
            {PROCESSORS.map(p => (
              <div key={p.name} className="card">
                <p className="font-semibold text-[var(--color-ink)] mb-0.5">{p.name}</p>
                <p className="text-[var(--color-muted)]">
                  {p.desc}
                  {p.link && (
                    <>
                      {' '}
                      <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline">
                        Datenschutz-Info
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">7. Speicherdauer</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Account- und Profil-Daten: bis zur Löschung deines Accounts durch dich</li>
            <li>Chat-Historie: bis zur Löschung durch dich (einzeln oder gesamt)</li>
            <li>Technische Logs: 30 Tage</li>
            <li>Zahlungsbelege: 10 Jahre (gesetzliche Aufbewahrungspflicht §257 HGB)</li>
            <li>KI-Eingaben bei Langdock und Anthropic: bis zu 30 Tage (siehe §5)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">8. Betroffenenrechte</h2>
          <p className="mb-2">Gemäß DSGVO stehen dir folgende Rechte zu:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17)</li>
            <li>Einschränkung der Verarbeitung (Art. 18)</li>
            <li>Datenübertragbarkeit (Art. 20)</li>
            <li>Widerspruch (Art. 21)</li>
            <li>Widerruf erteilter Einwilligungen (Art. 7 Abs. 3) — wirkt für die Zukunft</li>
            <li>Beschwerde bei der zuständigen Datenschutzbehörde</li>
          </ul>
          <p className="mt-3">
            Anfragen richte bitte an:{' '}
            <a href="mailto:kontakt@deepling.de" className="text-[var(--color-accent)] underline">kontakt@deepling.de</a>.
            Wir antworten innerhalb von 30 Tagen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">9. Cookies und Tracking</h2>
          <p className="mb-3">
            Diese Anwendung verwendet ausschließlich technisch notwendige Cookies zur Authentifizierung
            (Supabase-Session-Cookies). Es werden keine Marketing-, Werbe- oder Analyse-Cookies eingesetzt,
            keine Drittanbieter-Tracker eingebunden.
          </p>
          <p>
            Da keine zustimmungspflichtigen Cookies eingesetzt werden, zeigen wir keinen Cookie-Banner
            (§ 25 Abs. 2 Nr. 2 TTDSG).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">10. Sicherheit</h2>
          <p>
            Alle Datenübertragungen sind TLS-verschlüsselt. Der Datenbank-Zugriff erfolgt über Row-Level-Security
            — jeder Nutzer sieht ausschließlich seine eigenen Datensätze. Passwörter werden ausschließlich als
            Hash gespeichert (bcrypt durch Supabase Auth). API-Schlüssel werden in einer separaten,
            verschlüsselten Konfiguration verwahrt.
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[var(--color-border)] flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
        <Link href="/impressum" className="hover:text-[var(--color-ink)]">Impressum</Link>
        <span>·</span>
        <Link href="/agb" className="hover:text-[var(--color-ink)]">AGB</Link>
        <span>·</span>
        <Link href="/" className="hover:text-[var(--color-ink)]">Startseite</Link>
      </div>
    </main>
  )
}
