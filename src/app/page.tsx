import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogoMark, LogoWatermark } from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  // B2B-Activation-Code-Links zeigen teils auf die Root (deepling.de/?code=…)
  // — z.B. nach Domain-Umzug von der alten Vercel-URL. Den Code an /signup
  // durchreichen, sonst geht er verloren, der User registriert sich ohne
  // Org-Zuordnung und hängt am Billing-Gate fest ("schreitet nicht voran").
  const { code } = await searchParams
  if (code?.trim()) {
    redirect(`/signup?code=${encodeURIComponent(code.trim())}`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminEmail(user?.email)

  return (
    <main className="min-h-dvh flex flex-col">
      {/* Sticky Header / Nav */}
      <header className="sticky top-0 z-30 bg-[var(--color-bg)]/85 backdrop-blur border-b border-[var(--color-border)]">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="font-semibold tracking-tight shrink-0 flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <LogoMark size={30} />
            <span className="text-lg">
              Deepling
              <span className="text-[var(--color-muted)] font-normal"> — Coaching Zwilling</span>
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            <a    href="#wie"      className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">So funktioniert's</a>
            <a    href="#ueber-uns" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Über uns</a>
            {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && (
              <Link href="/billing"   className="px-3 py-1.5 rounded-full hover:bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Für Unternehmen</Link>
            )}
            {isAdmin && (
              <>
                <Link href="/admin" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-warning)]/15 text-[var(--color-warning)] font-medium">🔧 Admin</Link>
                <Link href="/admin/compare" className="px-3 py-1.5 rounded-full hover:bg-[var(--color-warning)]/15 text-[var(--color-warning)] font-medium">⇆ Compare</Link>
              </>
            )}
          </nav>
          <div className="flex items-center gap-1.5">
            {user ? (
              <Link href="/coach" className="btn btn-primary text-sm px-3 py-1.5">Zum Coach</Link>
            ) : (
              <>
                <Link href="/login"  className="btn btn-ghost   text-sm px-3 py-1.5">Login</Link>
                <Link href="/signup" className="btn btn-primary text-sm px-3 py-1.5">Starten</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-5 pt-10 pb-16 sm:pt-14 sm:pb-24 max-w-6xl w-full mx-auto overflow-hidden">
        <div className="hero-aurora" aria-hidden="true" />
        {/* Dezentes Logo-Watermark im Hintergrund */}
        <LogoWatermark
          className="absolute -top-10 -left-10 w-[420px] h-[420px] text-[var(--color-ink)] opacity-[0.04] pointer-events-none hidden md:block"
        />
        <div className="relative grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-10 md:gap-14 items-center">
          {/* LINKS: Text */}
          <div>
            <div className="chip mb-5 anim-fade-up">Für Führungskräfte</div>
            <h1 className="anim-fade-up text-[2.4rem] sm:text-5xl lg:text-6xl font-semibold leading-[1.04] tracking-tight">
              Deepling. <br />
              <span className="text-[var(--color-ink-2)]">Nur Ihr beide. Für alles, was du sonst nicht laut aussprichst.</span>
            </h1>
            <p className="anim-fade-up-delay mt-5 text-lg text-[var(--color-ink-2)] max-w-xl">
              Dein Profil. Dein Coach. Ganz auf dich zugeschnitten: Deepling kennt deine
              Stärken, deine Ziele — aber auch deine blinden Flecken und Ausweichmuster.
            </p>
            <p className="anim-fade-up-delay mt-3 text-lg text-[var(--color-ink-2)] max-w-xl">
              Starte mit dem Fragebogen, erhalte deine 10-seitige Profilanalyse —
              und nutze dann Deepling im Chat.
            </p>
            <div className="anim-fade-up-delay2 mt-7 flex flex-col sm:flex-row gap-3">
              <Link href="/signup" className="btn btn-primary btn-block sm:w-auto">
                Profil erstellen
              </Link>
              <a href="#wie" className="btn btn-secondary btn-block sm:w-auto">
                So funktioniert's
              </a>
            </div>
            <p className="anim-fade-up-delay3 mt-3 text-sm text-[var(--color-muted)]">
              {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
                ? 'Keine Kreditkarte für Trial. Jederzeit kündbar.'
                : 'Offene Testphase — keine Zahlung, kein Limit.'}
            </p>
          </div>

          {/* RECHTS: Founder-Portrait + animiertes Visual */}
          <HeroVisual />
        </div>
      </section>

      {/* How it works */}
      <section id="wie" className="scroll-mt-20 px-5 py-14 bg-[var(--color-surface-2)] border-y border-[var(--color-border)]">
        <div className="max-w-3xl w-full mx-auto">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">So entsteht dein Deepling</h2>
          <ol className="space-y-4">
            <Step n={1} title="50 Fragen im Scan-Modus">
              Eine Frage pro Bildschirm. Keine Bewertung, an fünf festen Stellen eine Nachfrage —
              sonst sauberes Profiling. Dauer: 18–25 Minuten.
            </Step>
            <Step n={2} title="Dein Coach-Profil entsteht">
              Aus deinen Antworten wird ein individuelles Coach-Profil mit Tonprofil,
              Einstiegsmodus und Gesehen-Signal — automatisch.
            </Step>
            <Step n={3} title="Chat mit deinem Deepling">
              Du sprichst mit einem Coach, der dein Profil kennt. Eine Frage pro Antwort.
              Keine Listen. Keine Therapie-Floskeln.
            </Step>
          </ol>
        </div>
      </section>

      {/* Founder-Quote (Bild ist jetzt im Hero, hier nur Quote + kleineres Bild) */}
      <section id="ueber-uns" className="scroll-mt-20 px-5 py-16 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--color-ink)] shrink-0">
            <picture>
              <source srcSet="/founder.jpg" type="image/jpeg" />
              <img src="/founder.jpg.placeholder.svg" alt="" className="w-full h-full object-cover grayscale" />
            </picture>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Über uns</div>
            <div className="font-semibold text-[var(--color-ink)]">Michael Müller, Gründer</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-0">
          {/* Quote */}
          <div>
            <div className="anim-fade-up text-5xl leading-none text-[var(--color-accent)] font-serif mb-1">"</div>
            <blockquote className="anim-fade-up-delay text-lg sm:text-xl leading-relaxed text-[var(--color-ink)] font-medium space-y-4">
              <p>
                Deepling ist für alle erfolgreichen Menschen, die nicht noch mehr Tipps brauchen.
                Dein Spiegel, der nicht ausweicht.
              </p>
              <p className="text-base text-[var(--color-ink-2)] font-normal">
                Denn die schwierigsten Themen besprichst du oft mit niemandem wirklich offen.
                Nicht mit deinem Team. Nicht mit deinen Gesellschaftern. Manchmal nicht einmal
                mit dir selbst.
              </p>
              <p className="text-base text-[var(--color-ink-2)] font-normal">
                Er stresstestet deine Entscheidungen, statt dich nur zu bestätigen. Sortiert
                Gedanken, die du nicht laut sagen kannst. Zeigt Muster, bevor sie wieder teuer
                werden. Er hilft dir, in Krisen nicht aus Reflex zu handeln, sondern aus Klarheit.
              </p>
              <p className="text-base text-[var(--color-ink-2)] font-normal">
                Und Deepling stellt die Frage, die im Alltag oft untergeht:{' '}
                <strong>Optimierst du das Richtige — oder nur das, was am lautesten ist?</strong>
              </p>
              <p className="text-base text-[var(--color-ink-2)] font-normal italic">
                Kein Chatbot. Kein digitales Notizbuch. Ein stiller, präziser Denkraum für die
                Momente, in denen du sonst mit niemandem sprechen kannst. Auch nachts um 3 Uhr,
                wenn die Decke zu Beton wird.
              </p>
            </blockquote>
            <div className="anim-fade-up-delay2 mt-6 pt-5 border-t border-[var(--color-border)] flex items-center justify-end gap-3 flex-wrap">
              <a
                href="https://www.linkedin.com/in/michael-m%C3%BCller-50037798/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a66c2] text-white text-sm font-medium hover:bg-[#0856a8] transition-colors"
                aria-label="LinkedIn-Profil von Michael Müller"
              >
                <LinkedInIcon />
                <span>Auf LinkedIn vernetzen</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA-Section */}
      <section className="px-5 py-14 max-w-3xl w-full mx-auto text-center border-t border-[var(--color-border)]">
        {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' ? (
          <>
            <h2 className="text-2xl font-semibold tracking-tight mb-3">Deepling für dein Team</h2>
            <p className="text-[var(--color-ink-2)] mb-6">Coaching-Zugänge für Führungskräfte — individuell eingerichtet, gebündelt abgerechnet.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Link href="/signup" className="btn btn-primary btn-block sm:flex-1">Profil erstellen</Link>
              <Link href="/billing" className="btn btn-secondary btn-block sm:flex-1">Für Unternehmen</Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold tracking-tight mb-3">Aktuell kostenlos in der Testphase</h2>
            <p className="text-[var(--color-ink-2)] mb-6">Keine Zahlung, kein Limit. Nur dein ehrliches Feedback.</p>
            <Link href="/signup" className="btn btn-primary inline-block">
              Kostenlos starten
            </Link>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="mt-auto px-5 py-12 bg-[var(--color-surface-2)] border-t border-[var(--color-border)]">
        <div className="max-w-5xl w-full mx-auto grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-lg mb-3">
              <LogoMark size={28} />
              <span>Deepling</span>
            </Link>
            <p className="text-sm text-[var(--color-ink-2)] max-w-sm">
              Ein Coach, der nicht ausweicht. Auf dein Profil zugeschnitten.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">Produkt</div>
            <ul className="space-y-2 text-sm">
              <li><a href="#wie" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">So funktioniert's</a></li>
              <li><a href="#ueber-uns" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Über uns</a></li>
              {process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && (
                <li><Link href="/billing" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Für Unternehmen</Link></li>
              )}
              <li><Link href="/signup" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Profil erstellen</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">Rechtliches</div>
            <ul className="space-y-2 text-sm">
              <li><Link href="/impressum" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Impressum</Link></li>
              <li><Link href="/datenschutz" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">Datenschutz</Link></li>
              <li><Link href="/agb" className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)]">AGB</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-[var(--color-border)] text-xs text-[var(--color-muted)] flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} Deepling</span>
          <span>Made in Bayern · App in Frankfurt · DB in London</span>
        </div>
      </footer>
    </main>
  )
}

function HeroVisual() {
  return (
    <div className="relative w-full max-w-md mx-auto md:max-w-none aspect-square anim-image">
      {/* SVG-Hintergrund: zwei pulsierende Kreise + Verbindungspunkte */}
      <svg
        viewBox="0 0 400 400"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#2f6df4" stopOpacity="0.18"/>
            <stop offset="60%" stopColor="#2f6df4" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="#2f6df4" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="connectorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#1a1d24" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#2f6df4" stopOpacity="0.6"/>
          </linearGradient>
        </defs>

        {/* Atmosphärischer Halo */}
        <circle cx="200" cy="200" r="190" fill="url(#halo)"/>

        {/* Zwei große Ring-Kreise = "Zwilling" */}
        <circle cx="150" cy="200" r="130" fill="none" stroke="#1a1d24" strokeWidth="1.5"
          opacity="0.18" className="anim-pulse-ring"/>
        <circle cx="250" cy="200" r="130" fill="none" stroke="#2f6df4" strokeWidth="1.5"
          opacity="0.18" className="anim-pulse-ring-delay"/>

        {/* Dezente Konstellation (Verbindungslinien) */}
        <g stroke="#8a8f9a" strokeWidth="0.6" opacity="0.3">
          <line x1="80"  y1="80"  x2="200" y2="200"/>
          <line x1="320" y1="80"  x2="200" y2="200"/>
          <line x1="80"  y1="320" x2="200" y2="200"/>
          <line x1="320" y1="320" x2="200" y2="200"/>
          <line x1="200" y1="200" x2="200" y2="55"/>
          <line x1="200" y1="200" x2="200" y2="345"/>
        </g>

        {/* Pulsierende Knotenpunkte */}
        <circle cx="80"  cy="80"  r="4" fill="#2f6df4" className="anim-pulse-node"/>
        <circle cx="320" cy="80"  r="4" fill="#1a1d24" className="anim-pulse-node" style={{ animationDelay: '0.5s' }}/>
        <circle cx="80"  cy="320" r="4" fill="#1a1d24" className="anim-pulse-node" style={{ animationDelay: '1s' }}/>
        <circle cx="320" cy="320" r="4" fill="#2f6df4" className="anim-pulse-node" style={{ animationDelay: '1.5s' }}/>
        <circle cx="200" cy="55"  r="4" fill="#2f6df4" className="anim-pulse-node" style={{ animationDelay: '0.2s' }}/>
        <circle cx="200" cy="345" r="4" fill="#1a1d24" className="anim-pulse-node" style={{ animationDelay: '1.2s' }}/>
      </svg>

      {/* Founder-Portrait im Zentrum, floating */}
      <div className="absolute inset-0 flex items-center justify-center anim-float">
        <div className="relative">
          <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-full overflow-hidden border-[5px] border-[var(--color-ink)] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] bg-[var(--color-surface-2)]">
            <picture>
              <source srcSet="/founder.jpg" type="image/jpeg" />
              <source srcSet="/founder.png" type="image/png" />
              <img
                src="/founder.jpg.placeholder.svg"
                alt="Michael Müller, Gründer"
                className="w-full h-full object-cover grayscale"
                loading="eager"
              />
            </picture>
          </div>
          {/* Akzent-Punkt unten rechts */}
          <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[var(--color-accent)] ring-4 ring-[var(--color-bg)] flex items-center justify-center anim-float-slow">
            <span className="text-white text-sm font-semibold">★</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"/>
    </svg>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="card flex gap-4">
      <div className="w-9 h-9 shrink-0 rounded-full bg-[var(--color-ink)] text-white flex items-center justify-center font-semibold">
        {n}
      </div>
      <div>
        <div className="font-semibold mb-1">{title}</div>
        <div className="text-sm text-[var(--color-ink-2)]">{children}</div>
      </div>
    </li>
  )
}

