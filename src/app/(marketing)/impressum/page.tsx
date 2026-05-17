import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Impressum des Coaching-Zwilling — Angaben gemäß §5 TMG.',
  alternates: { canonical: '/impressum' },
  robots: { index: true, follow: true },
}

export default function ImpressumPage() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Impressum</h1>
      <p className="text-sm text-[var(--color-muted)] mb-10">Angaben gemäß §5 TMG</p>

      <div className="space-y-8 text-sm text-[var(--color-ink-2)] leading-relaxed">

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Anbieter</h2>
          <div className="card text-[var(--color-ink-2)] space-y-1">
            <p className="font-semibold text-[var(--color-ink)]">Lom-Ali Imadaev</p>
            <p>Kreuzstraße 1</p>
            <p>82276 Adelshofen</p>
            <p>Deutschland</p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Kontakt</h2>
          <div className="space-y-1">
            <p>
              E-Mail:{' '}
              <a href="mailto:oss@osss.pro" className="text-[var(--color-accent)] underline">
                oss@osss.pro
              </a>
            </p>
            <p>
              Support:{' '}
              <a href="mailto:oss@osss.pro" className="text-[var(--color-accent)] underline">
                oss@osss.pro
              </a>
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Umsatzsteuer</h2>
          <p>Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Verantwortlich für den Inhalt</h2>
          <p>
            gemäß §55 Abs. 2 RStV:<br />
            Lom-Ali Imadaev, Kreuzstraße 1, 82276 Adelshofen
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Streitschlichtung</h2>
          <p>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank" rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline"
            >
              ec.europa.eu/consumers/odr
            </a>.
          </p>
          <p className="mt-2">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Haftung für Inhalte</h2>
          <p className="text-[var(--color-muted)]">
            Als Diensteanbieter sind wir gemäß §7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach
            den allgemeinen Gesetzen verantwortlich. Nach §§8 bis 10 TMG sind wir als Diensteanbieter
            jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu
            überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-[var(--color-ink)] text-base mb-3">Hinweis zu KI-generierten Inhalten</h2>
          <p className="text-[var(--color-muted)]">
            Die Coach-Antworten dieses Dienstes werden durch ein Large-Language-Model (Claude, Anthropic PBC)
            generiert. Sie ersetzen keine professionelle psychologische, medizinische oder rechtliche
            Beratung. In Krisensituationen wende dich bitte an die Telefonseelsorge unter{' '}
            <a href="tel:0800-1110111" className="text-[var(--color-accent)] underline">0800 111 0 111</a>{' '}
            oder den ärztlichen Notdienst (112).
          </p>
        </section>

      </div>

      <div className="mt-12 pt-8 border-t border-[var(--color-border)] flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-muted)]">
        <Link href="/datenschutz" className="hover:text-[var(--color-ink)]">Datenschutzerklärung</Link>
        <span>·</span>
        <Link href="/agb" className="hover:text-[var(--color-ink)]">AGB</Link>
        <span>·</span>
        <Link href="/" className="hover:text-[var(--color-ink)]">Startseite</Link>
      </div>
    </main>
  )
}
