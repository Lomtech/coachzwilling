import 'server-only'

/**
 * Deep-Space-Profil — HTML-Renderer im Design des „markus_variante_b_mini"-PDFs.
 *
 * Erzeugt ein eigenständiges, druckfertiges HTML-Dokument (A4, print-optimiert)
 * aus einer strukturierten DeepSpaceDoc. Zwei Varianten:
 *   • 'mini' — Vorschau (2 Kernmuster + blinder Fleck + 49-€-Paywall) → Lead-Magnet
 *   • 'full' — vollständiges Rohprofil (alle Muster, Schatten, kein Paywall)
 *
 * Bewusst self-contained (inline CSS, System-Fonts) → als PDF speicherbar
 * (Cmd/Strg+P) und per Mail versendbar, ohne externe Assets.
 */

export interface DeepSpacePattern {
  title: string
  body: string
}

export interface DeepSpaceKernmuster {
  staerke: DeepSpacePattern
  kehrseite: DeepSpacePattern
}

export interface DeepSpaceDoc {
  name: string
  /** z.B. "Partner · IT-Strategieberatung" */
  role: string
  /** Ich-Satz für die Titelseite */
  pullQuote: string
  /** kurze Pills: Erfahrung, Führungsspanne, Leitthema, Jahr */
  chips: string[]
  /** ≥2 Stärke/Kehrseite-Paare; 'mini' zeigt die ersten 2 */
  kernmuster: DeepSpaceKernmuster[]
  blinderFleck: {
    wasDuWillst: string
    wasPassiert: string
    /** Ich-Satz für die dunkle „Aus deinen eigenen Worten"-Box */
    eigeneWorte: string
  }
  /** nur 'full': Schatten-Abschnitt (optional) */
  schatten?: DeepSpacePattern
  /** nur 'full': 90-Tage-Orientierung (optional) */
  orientierung?: string
}

export type DeepSpaceVariant = 'mini' | 'full'

interface RenderOpts {
  variant: DeepSpaceVariant
  /** Basis-URL für den Paywall-Button (nur 'mini'). */
  appUrl?: string
  /** Preis für den Paywall-CTA (nur 'mini'). */
  price?: string
  /**
   * Ziel des Paywall-CTA (nur 'mini'). Default: {appUrl}/onboarding — richtig
   * für Mini-Scan-Leads (die den Vollscan noch machen müssen). Für bereits
   * onboardete Nutzer stattdessen auf die Bezahlseite zeigen, sonst würde der
   * Button sie in einen Fragebogen schicken, den sie schon gemacht haben.
   */
  ctaUrl?: string
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --ink: #211f1c; --ink2: #4b4740; --muted: #9a8f80; --faint: #b9b0a3;
    --line: #e8e3da; --accent: #d0642c;
    --staerke-bg: #fbeee6; --staerke-bar: #d0642c; --staerke-label: #bd5824;
    --kehr-bg: #f4f0e6; --kehr-bar: #b39b5e; --kehr-label: #8a7539;
    --green: #3f7a54; --paper: #faf8f4; --card: #ffffff; --dark: #1b1917;
  }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); background: #e9e6e0; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: 210mm; min-height: 297mm; padding: 24mm 22mm; margin: 0 auto 14px;
    background: var(--paper); position: relative; overflow: hidden;
  }
  .page + .page { }
  .page-dark { background: var(--dark); color: #fff; display: flex; align-items: center; justify-content: center; }
  @media screen {
    body { padding: 20px 0; }
    .page { box-shadow: 0 8px 40px rgba(0,0,0,.12); border-radius: 4px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .page { margin: 0; box-shadow: none; border-radius: 0; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  }
  .kicker { font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .rule { width: 46px; height: 3px; background: var(--accent); border: none; border-radius: 3px; }
  .pill { display: inline-block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700;
          padding: 4px 10px; border-radius: 999px; }

  /* ── Cover ── */
  .cover { text-align: center; }
  .cover .kicker { color: #b9b0a3; }
  .cover h1 { font-size: 56px; font-weight: 700; letter-spacing: -.02em; margin: 18px 0 6px; }
  .cover .sub { color: #b9b0a3; font-size: 15px; letter-spacing: .04em; }
  .cover .rule { margin: 26px auto 0; }

  /* ── Title page ── */
  .t-label { margin-bottom: 40px; }
  .t-eyebrow { font-size: 14px; color: var(--muted); margin-bottom: 4px; }
  .t-name { font-size: 46px; font-weight: 700; letter-spacing: -.02em; line-height: 1.05; }
  .t-role { font-size: 15px; color: var(--ink2); margin-top: 4px; }
  .t-rule { margin: 26px 0; }
  .t-quote { font-size: 22px; line-height: 1.4; font-weight: 500; max-width: 92%; color: var(--ink); }
  .chips { margin-top: 34px; display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { font-size: 12px; color: var(--ink2); background: #efeae1; border: 1px solid var(--line);
          padding: 6px 12px; border-radius: 999px; }
  .t-foot { position: absolute; left: 22mm; right: 22mm; bottom: 20mm; display: flex; justify-content: space-between;
            font-size: 11px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; }

  /* ── Section headers ── */
  .sec-head { margin-bottom: 26px; }
  .sec-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .sec-num { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .sec-h { font-size: 30px; font-weight: 700; letter-spacing: -.015em; }
  .sec-sub { font-size: 15px; color: var(--muted); margin-top: 8px; }

  /* ── Pattern cards ── */
  .card-stack { display: flex; flex-direction: column; gap: 16px; }
  .pcard { border-radius: 12px; padding: 20px 22px 20px 24px; border-left: 5px solid; }
  .pcard .plabel { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; }
  .pcard .ptitle { font-size: 17px; font-weight: 700; line-height: 1.3; margin-bottom: 8px; color: var(--ink); }
  .pcard .pbody { font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
  .pcard.staerke { background: var(--staerke-bg); border-left-color: var(--staerke-bar); }
  .pcard.staerke .plabel { color: var(--staerke-label); }
  .pcard.kehrseite { background: var(--kehr-bg); border-left-color: var(--kehr-bar); }
  .pcard.kehrseite .plabel { color: var(--kehr-label); }
  .pair + .pair { margin-top: 8px; }

  /* ── Blind spot ── */
  .cols { display: flex; gap: 16px; margin-bottom: 24px; }
  .col { flex: 1; border: 1px solid var(--line); border-radius: 12px; padding: 20px; background: var(--card); }
  .col .clabel { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; }
  .col.want .clabel { color: var(--green); }
  .col.happen .clabel { color: var(--accent); }
  .col .cbody { font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
  .quotebox { background: var(--dark); color: #fff; border-radius: 14px; padding: 30px 32px; margin-bottom: 22px; }
  .quotebox .qlabel { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #8f877b; font-weight: 700; margin-bottom: 14px; }
  .quotebox .qtext { font-size: 20px; line-height: 1.45; font-weight: 500; }
  .teaser { font-size: 14px; line-height: 1.6; color: var(--muted); margin-bottom: 26px; max-width: 94%; }

  /* ── Paywall (mini) ── */
  .paywall { border: 1px solid var(--line); border-radius: 14px; padding: 24px; background: #fcfaf6; }
  .paywall .pwlabel { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: 12px; }
  .paywall .pwbody { font-size: 14px; line-height: 1.65; color: var(--ink2); margin-bottom: 20px; }
  .paywall .pwbody strong { color: var(--ink); }
  .cta { display: inline-block; background: var(--accent); color: #fff; text-decoration: none; font-weight: 700;
         font-size: 15px; padding: 13px 24px; border-radius: 10px; }
  .pwfine { font-size: 12px; color: var(--muted); margin-top: 12px; }

  .foot-note { position: absolute; left: 22mm; right: 22mm; bottom: 20mm; display: flex; justify-content: space-between;
               font-size: 11px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; }
`

function coverPage(): string {
  return `<section class="page page-dark">
    <div class="cover">
      <div class="kicker">Denkhorizonte</div>
      <h1>Deep&nbsp;Space</h1>
      <div class="sub">${'Vorschau'}</div>
      <hr class="rule" />
    </div>
  </section>`
}

function titlePage(doc: DeepSpaceDoc, variant: DeepSpaceVariant): string {
  const chips = doc.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')
  const footRight = variant === 'mini' ? 'Vorschau · 1 / 3' : 'Vollständiges Rohprofil'
  return `<section class="page">
    <div class="t-label kicker">Deepling · Denkhorizonte</div>
    <div class="t-eyebrow">Persönliches Tiefenprofil</div>
    <div class="t-name">${esc(doc.name)}</div>
    <div class="t-role">${esc(doc.role)}</div>
    <hr class="rule t-rule" />
    <div class="t-quote">„${esc(doc.pullQuote)}"</div>
    <div class="chips">${chips}</div>
    <div class="t-foot"><span>Vertraulich · Nur für den persönlichen Gebrauch</span><span>${footRight}</span></div>
  </section>`
}

function patternPair(k: DeepSpaceKernmuster): string {
  return `<div class="pair">
    <div class="pcard staerke">
      <div class="plabel">Stärke</div>
      <div class="ptitle">${esc(k.staerke.title)}</div>
      <div class="pbody">${esc(k.staerke.body)}</div>
    </div>
    <div class="pcard kehrseite">
      <div class="plabel">Kehrseite</div>
      <div class="ptitle">${esc(k.kehrseite.title)}</div>
      <div class="pbody">${esc(k.kehrseite.body)}</div>
    </div>
  </div>`
}

function kernmusterPage(doc: DeepSpaceDoc, variant: DeepSpaceVariant): string {
  const pairs = (variant === 'mini' ? doc.kernmuster.slice(0, 2) : doc.kernmuster)
    .map(patternPair).join('')
  return `<section class="page">
    <div class="sec-head">
      <div class="sec-top">
        <span class="sec-num">01 · Wie du funktionierst</span>
        <span class="pill" style="background:#fbeee6;color:#bd5824;">Dauerhaft</span>
      </div>
      <div class="sec-h">Deine Kernmuster</div>
      <div class="sec-sub">Diese Muster gelten unabhängig von Situation und Umfeld.</div>
    </div>
    <div class="card-stack">${pairs}</div>
  </section>`
}

function blindSpotPage(doc: DeepSpaceDoc, variant: DeepSpaceVariant, opts: RenderOpts): string {
  const paywall = variant === 'mini'
    ? `<div class="teaser">Woher dieses Muster kommt, was es konkret schützt, und wie sich das in weiteren Entscheidungen zeigt — das liegt im vollständigen Rohprofil.</div>
       <div class="paywall">
         <div class="pwlabel">Was du noch nicht siehst</div>
         <div class="pwbody">Diese Vorschau zeigt zwei Muster und einen blinden Fleck. Das vollständige Rohprofil enthält deine gesamte Ausweichlogik, dein Entscheidungsleck, deinen Schatten — und wie dein Deepling kalibriert ist, dich <strong>im Moment zu erwischen, nicht danach.</strong></div>
         <a class="cta" href="${esc(opts.ctaUrl ?? `${opts.appUrl ?? 'https://deepling.de'}/onboarding`)}">Rohprofil freischalten — ${esc(opts.price ?? '49 €')}</a>
         <div class="pwfine">Einmalig · Sofortiger Zugang · Kein Abo</div>
       </div>`
    : (doc.schatten
        ? `<div class="pcard kehrseite" style="margin-top:4px;"><div class="plabel">Schatten</div><div class="ptitle">${esc(doc.schatten.title)}</div><div class="pbody">${esc(doc.schatten.body)}</div></div>`
        : '') +
      (doc.orientierung
        ? `<div class="teaser" style="margin-top:22px;"><strong style="color:var(--ink);">90-Tage-Orientierung:</strong> ${esc(doc.orientierung)}</div>`
        : '')

  return `<section class="page">
    <div class="sec-head">
      <div class="sec-top">
        <span class="sec-num">02 · Dein blinder Fleck</span>
        <span class="pill" style="background:#fbf1e6;color:#b07a2e;">Aktuelle Phase</span>
      </div>
      <div class="sec-h">Was du weißt — und trotzdem nicht siehst</div>
    </div>
    <div class="cols">
      <div class="col want"><div class="clabel">Was du willst</div><div class="cbody">${esc(doc.blinderFleck.wasDuWillst)}</div></div>
      <div class="col happen"><div class="clabel">Was passiert</div><div class="cbody">${esc(doc.blinderFleck.wasPassiert)}</div></div>
    </div>
    <div class="quotebox">
      <div class="qlabel">Aus deinen eigenen Worten</div>
      <div class="qtext">„${esc(doc.blinderFleck.eigeneWorte)}"</div>
    </div>
    ${paywall}
    <div class="foot-note"><span>Vertraulich · Nur für den persönlichen Gebrauch</span><span>Deepling · Denkhorizonte</span></div>
  </section>`
}

export function renderDeepSpaceHtml(doc: DeepSpaceDoc, opts: RenderOpts): string {
  const title = `Deep Space — ${esc(doc.name)}`
  return `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${CSS}</style>
</head><body>
${coverPage()}
${titlePage(doc, opts.variant)}
${kernmusterPage(doc, opts.variant)}
${blindSpotPage(doc, opts.variant, opts)}
</body></html>`
}

/**
 * Referenz-Beispiel aus dem Markus-PDF — zum visuellen Abgleich des Designs
 * und als Fallback/Demo. Inhaltlich 1:1 aus markus_variante_b_mini_deepspace.
 */
export const SAMPLE_DEEPSPACE_DOC: DeepSpaceDoc = {
  name: 'Markus',
  role: 'Partner · IT-Strategieberatung',
  pullQuote: 'Ich weiß, wohin ich will. Und ich vermeide das einzige Gespräch, das den Weg dorthin klären würde.',
  chips: ['10–15 J. Berufserfahrung', '6–50 Personen Führung', 'Orientierung / Sinn', '2026'],
  kernmuster: [
    {
      staerke: {
        title: 'Du baust Dinge, die funktionieren — weil du es so aufgebaut hast',
        body: 'Du übernimmst Führung nicht weil du es immer willst, sondern weil du Steuerungslosigkeit nicht aushältst. Das macht dich verlässlich, wo andere zögern. Wenn ein Projekt läuft und das Team liefert, bestätigt das: dein Urteil stimmt.',
      },
      kehrseite: {
        title: 'Du setzt konsequent um — auch das Falsche',
        body: 'Umsetzungsstärke ist kein Vorteil, wenn die Richtung nicht stimmt. Und das Gespräch, das die Richtung klären würde, schiebst du seit Monaten raus. Nicht weil du es nicht weißt — sondern weil du weißt, was es bedeutet, wenn du es angehst.',
      },
    },
    {
      staerke: {
        title: 'Wenn du weißt, dass du die relevanten Hebel bedienen kannst, bist du ruhig',
        body: 'Einfluss ist dein Stabilitätsanker — nicht Vertrauen, nicht Struktur. Das funktioniert zuverlässig, solange die Hebel klar sind.',
      },
      kehrseite: {
        title: 'Echter Kontrollverlust trifft dich tiefer als alles andere',
        body: 'Nicht Ablehnung, nicht Kritik — sondern das Gefühl, die eigene Richtung nicht mehr im Griff zu haben. Genau das droht, wenn das Partnergespräch real wird.',
      },
    },
  ],
  blinderFleck: {
    wasDuWillst: 'Die Firmenrichtung durchsetzen. Wissen, wohin es geht. Klarheit über das Wohin — nicht das Wie.',
    wasPassiert: 'Das einzige Gespräch vermeiden, das diese Klarheit erzeugen würde. Seit Monaten. Mit einem guten Grund jedes Mal.',
    eigeneWorte: 'Du willst Kontrolle — aber du hast Angst vor dem Ergebnis echter Kontrolle. Weil echte Kontrolle bedeutet: entscheiden müssen, ohne zu wissen wie es ausgeht.',
  },
}
