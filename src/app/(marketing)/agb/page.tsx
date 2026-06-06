import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AGB',
  description: 'Allgemeine Geschäftsbedingungen des Coaching-Zwilling.',
  alternates: { canonical: '/agb' },
  robots: { index: true, follow: true },
}

export default function AgbPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Allgemeine Geschäftsbedingungen</h1>
      <p className="text-sm text-[var(--color-muted)] mb-10">Stand: Mai 2026</p>

      <div className="space-y-8 text-sm text-[var(--color-ink-2)] leading-relaxed">

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§1 Anbieter und Vertragspartner</h2>
          <p>
            Anbieter dieses Dienstes ist Lom-Ali Imadaev, Kreuzstraße 1, 82276 Adelshofen
            (im Folgenden „Anbieter"). Kontakt:{' '}
            <a href="mailto:oss@osss.pro" className="text-[var(--color-accent)] underline">oss@osss.pro</a>.
            Diese AGB regeln das Vertragsverhältnis zwischen dem Anbieter und dem Nutzer
            (im Folgenden „du" oder „Nutzer").
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§2 Leistungsbeschreibung</h2>
          <p className="mb-3">
            Der Anbieter stellt einen personalisierten KI-Coaching-Dienst zur Verfügung:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Strukturierter Selbstreflexions-Fragebogen mit 50 Fragen</li>
            <li>Automatisierte Erstellung eines individuellen Coach-Profils auf Basis deiner Antworten</li>
            <li>Dialog mit einem KI-Coach (Large-Language-Model „Claude" von Anthropic PBC), der
                personalisierte Fragen und Impulse liefert</li>
            <li>Speicherung deiner Gespräche zur Wiederaufnahme</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§3 Vertragsschluss und Probezeit</h2>
          <p className="mb-3">
            Der Vertrag kommt mit Registrierung des Nutzer-Accounts zustande. Mit Abschluss eines
            kostenpflichtigen Abonnements via Stripe erhältst du eine{' '}
            <strong>7-tägige kostenlose Probezeit</strong>. Während der Probezeit wird deine
            hinterlegte Zahlungsmethode nicht belastet.
          </p>
          <p>
            Kündigst du innerhalb der Probezeit, entstehen keine Kosten. Andernfalls beginnt nach
            Ablauf der Probezeit automatisch die kostenpflichtige Laufzeit gemäß §4.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§4 Preise und Laufzeit</h2>
          <p className="mb-3">
            Der Dienst wird in zwei Abrechnungsmodellen angeboten:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Monatlich</strong>: 29 € pro Monat. Monatlich zum Periodenende kündbar.</li>
            <li><strong>Jährlich</strong>: 228 € pro Jahr (entspricht 19 € pro Monat).
                Jährlich zum Periodenende kündbar.</li>
          </ul>
          <p className="mt-3">
            Gemäß §19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.
            Die Zahlung erfolgt über Stripe per Kreditkarte, SEPA-Lastschrift oder weitere
            in Stripe verfügbare Zahlungsmethoden. Verlängerungen werden automatisch
            zum Periodenende abgebucht, sofern nicht zuvor gekündigt.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§5 Widerrufsrecht für Verbraucher</h2>
          <p className="mb-3">
            Verbrauchern steht ein 14-tägiges Widerrufsrecht gemäß §355 BGB zu.
            Die Widerrufsfrist beginnt mit Vertragsschluss.
          </p>
          <p className="mb-3">
            <strong>Vorzeitiger Beginn der Leistung:</strong> Mit Aktivierung deines Coach-Profils und
            der ersten Coach-Antwort beginnt die Vertragsleistung. Du stimmst ausdrücklich zu, dass
            wir mit der Vertragsleistung vor Ablauf der Widerrufsfrist beginnen. Du bestätigst zudem
            deine Kenntnis, dass dein Widerrufsrecht mit vollständiger Vertragserfüllung erlischt
            (§356 Abs. 4 BGB).
          </p>
          <p>
            Widerruf an:{' '}
            <a href="mailto:oss@osss.pro" className="text-[var(--color-accent)] underline">oss@osss.pro</a>.
            Bei wirksamem Widerruf erstatten wir bereits geleistete Zahlungen unverzüglich.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§6 Kündigung</h2>
          <p>
            Du kannst dein Abonnement jederzeit über das Stripe-Kundenportal (zugänglich über
            „Einstellungen → Abo verwalten") kündigen. Die Kündigung wird zum Ende des laufenden
            Abrechnungszeitraums wirksam. Bereits gezahlte Beträge werden nicht anteilig erstattet.
            Eine Löschung deines Accounts ist jederzeit unter{' '}
            <a href="mailto:oss@osss.pro" className="text-[var(--color-accent)] underline">oss@osss.pro</a>{' '}
            möglich.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§7 Nutzungsregeln</h2>
          <p className="mb-3">Bei der Nutzung des Dienstes verpflichtest du dich:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>nur eigene oder einwilligungsbasierte Inhalte einzugeben</li>
            <li>keine rechtswidrigen, beleidigenden, gewaltverherrlichenden, diskriminierenden
                oder rechtsverletzenden Inhalte zu generieren oder zu teilen</li>
            <li>den Dienst nicht zur Erstellung von Inhalten zu missbrauchen, die Dritte gefährden,
                täuschen oder schädigen</li>
            <li>keine automatisierten Zugriffe (Bots, Scraping) ohne unsere ausdrückliche
                Zustimmung durchzuführen</li>
            <li>deine Zugangsdaten geheim zu halten</li>
          </ul>
          <p className="mt-3">
            Bei wiederholten oder schwerwiegenden Verstößen können wir den Zugang ohne Vorankündigung
            sperren und das Vertragsverhältnis außerordentlich kündigen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§8 KI-Inhalte und Haftungsbegrenzung</h2>
          <p className="mb-3">
            Die Coach-Antworten werden durch ein Large-Language-Model („Claude") generiert.
            Sie sind <strong>kein Ersatz</strong> für eine professionelle psychologische,
            therapeutische, medizinische oder rechtliche Beratung. Bei akuten Krisen wende dich
            bitte an die Telefonseelsorge (
            <a href="tel:08001110111" className="text-[var(--color-accent)] underline">0800 111 0 111</a>
            ) oder den Notarzt (112).
          </p>
          <p className="mb-3">
            Der Anbieter übernimmt keine Gewähr für Richtigkeit, Vollständigkeit oder Eignung der
            KI-generierten Inhalte für individuelle Lebenssituationen oder Entscheidungen. Du nutzt
            die Inhalte des Dienstes auf eigene Verantwortung.
          </p>
          <p>
            Im Übrigen haftet der Anbieter unbeschränkt nur für Vorsatz und grobe Fahrlässigkeit
            sowie für Verletzungen von Leben, Körper oder Gesundheit. Für leichte Fahrlässigkeit
            haften wir nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und
            nur in Höhe des bei Vertragsschluss vorhersehbaren, vertragstypischen Schadens.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§9 Verfügbarkeit</h2>
          <p>
            Wir streben eine Verfügbarkeit von 99 % im Jahresmittel an, geben darauf jedoch keine
            Garantie. Wartungsarbeiten, Software-Updates oder Ausfälle externer Anbieter (insbesondere
            Supabase, Vercel, Anthropic, Stripe) können zu vorübergehenden Unterbrechungen führen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§10 Datenschutz</h2>
          <p>
            Hinweise zur Datenverarbeitung findest du in unserer{' '}
            <Link href="/datenschutz" className="text-[var(--color-accent)] underline">
              Datenschutzerklärung
            </Link>. Mit Vertragsschluss bestätigst du, diese gelesen und zur Kenntnis genommen zu haben.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§11 Änderungen dieser AGB</h2>
          <p>
            Wir können diese AGB anpassen, wenn dies aus rechtlichen, technischen oder wirtschaftlichen
            Gründen erforderlich ist. Wir informieren dich mindestens 30 Tage vor Inkrafttreten per
            E-Mail. Widersprichst du nicht innerhalb dieser Frist, gelten die geänderten AGB als
            akzeptiert. Im Widerspruchsfall steht dir ein außerordentliches Kündigungsrecht zu.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">§12 Schlussbestimmungen</h2>
          <p className="mb-3">
            Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Ist der Nutzer Kaufmann,
            juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen,
            ist Gerichtsstand der Sitz des Anbieters (Bayern).
          </p>
          <p>
            Sollte eine Bestimmung dieser AGB unwirksam sein, bleibt die Wirksamkeit der übrigen
            Bestimmungen unberührt.
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[var(--color-border)] flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
        <Link href="/impressum" className="hover:text-[var(--color-ink)]">Impressum</Link>
        <span>·</span>
        <Link href="/datenschutz" className="hover:text-[var(--color-ink)]">Datenschutzerklärung</Link>
        <span>·</span>
        <Link href="/" className="hover:text-[var(--color-ink)]">Startseite</Link>
      </div>
    </main>
  )
}
