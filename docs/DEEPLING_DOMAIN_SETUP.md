# deepling.de — Domain-Setup Anleitung

Domain ist bei **IONOS** gekauft. Die Nameserver bleiben bei IONOS
(`ns10*.ui-dns.*`) — wir hosten dort DNS, weil das die saubere Lösung
für **Vercel-App + IONOS-Mail + Resend** in Kombination ist.

Drei Dinge müssen passieren:

1. **Vercel** kriegt die Domain (App-Hosting)
2. **IONOS-Mail**: lom@ und michael@deepling.de werden eingerichtet
3. **Resend** kriegt die Domain (transaktionale Mails: Coach-Followups, etc.)

Reihenfolge unten ist die schnellste — die DNS-Records lassen sich in
einem Rutsch eintragen, dann läuft die Verifikation bei allen drei
Anbietern parallel (max. 1–24h für volle Propagation).

---

## A) Vercel-Domain ist bereits registriert ✓

```bash
$ vercel domains add deepling.de        # erledigt
$ vercel domains add www.deepling.de    # erledigt
```

Status: `action_required` — Vercel wartet auf die DNS-Records (siehe D).

---

## B) IONOS-Mailbox einrichten — manuell

IONOS → **Mein Konto** → **Mein E-Mail** (oder Webhosting → Mail).

Für jede Mailbox:

1. **„E-Mail-Adresse erstellen"** klicken
2. Name: `lom` bzw. `michael`
3. Domain: `deepling.de` (Dropdown)
4. Passwort: 16+ Zeichen, gespeichert in Passwort-Manager
5. Postfachgröße: Standard (typisch 2 GB inkludiert)

Falls IONOS einen **Mail Basic / Business**-Tarif verlangt: kleinste
Stufe genügt (~1 €/Monat pro Postfach).

**Wichtig:** Die **MX-Records** legt IONOS beim Erstellen der Postfächer
automatisch in die DNS-Zone der Domain (`mx00.ionos.de` /
`mx01.ionos.de`). Nicht löschen!

### Mail-Client einrichten (Apple Mail / Outlook)

| Wert            | IMAP                  | SMTP                  |
|-----------------|-----------------------|-----------------------|
| Server          | `imap.ionos.de`       | `smtp.ionos.de`       |
| Port            | 993 (SSL)             | 587 (STARTTLS)        |
| Benutzername    | volle Adresse         | volle Adresse         |
| Passwort        | wie oben gesetzt      | wie oben gesetzt      |

---

## C) Resend — deepling.de hinzufügen

Resend-Dashboard → **Domains** → **Add Domain** → `deepling.de`.

Resend zeigt dann **DNS-Records** an, die in die IONOS-Zone müssen.
Typisch sind das:

| Type  | Name (Host)          | Value                                  |
|-------|----------------------|----------------------------------------|
| TXT   | `send`               | `v=spf1 include:amazonses.com ~all`    |
| TXT   | `resend._domainkey`  | `p=…` (DKIM-Public-Key — kopieren!)    |
| MX    | `send`               | `feedback-smtp.eu-west-1.amazonses.com` (Priorität 10) |

Region **eu-west-1** wählen falls Resend nach Region fragt — dann läuft
auch der Versand über EU-Infra (DSGVO).

---

## D) DNS-Records bei IONOS eintragen — alle auf einmal

IONOS → **Domains & SSL** → Domain `deepling.de` → **DNS** → **Eintrag hinzufügen**.

### Für Vercel (App-Hosting)

| Typ   | Host    | Wert                  | TTL  |
|-------|---------|-----------------------|------|
| A     | `@`     | `76.76.21.21`         | 3600 |
| CNAME | `www`   | `cname.vercel-dns.com`| 3600 |

### Für IONOS-Mail (bleibt unverändert, ist nach Postfach-Anlage da)

| Typ | Host | Wert            | Priorität |
|-----|------|-----------------|-----------|
| MX  | `@`  | `mx00.ionos.de` | 10        |
| MX  | `@`  | `mx01.ionos.de` | 10        |

### Für Resend (siehe C — Values aus deren Dashboard kopieren)

| Typ   | Host                | Wert                          | TTL  |
|-------|---------------------|-------------------------------|------|
| TXT   | `send`              | `v=spf1 …` (aus Resend)       | 3600 |
| TXT   | `resend._domainkey` | `p=…` (aus Resend)            | 3600 |
| MX    | `send`              | `feedback-smtp.…` (aus Resend)| 10   |

### Empfohlen: DMARC + kombiniertes SPF

| Typ | Host     | Wert                                                                          |
|-----|----------|-------------------------------------------------------------------------------|
| TXT | `@`      | `v=spf1 include:_spf.perfora.net include:_spf-eu.ionos.com ~all`              |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:lom@deepling.de; pct=100`                       |

Das Root-SPF (`@`) deckt **alle ausgehenden Mails der Hauptdomain** ab
(also die manuellen lom@/michael@ über IONOS-Webmail). Resend nutzt den
Subdomain-`send.` mit eigenem SPF — kein Konflikt.

---

## E) Verifikation

Nach DNS-Eintragung (5 min – 1 h):

```bash
# Vercel
vercel domains inspect deepling.de    # sollte "Valid Configuration" zeigen

# Resend
# Dashboard → Domains → "Verify DNS Records" klicken
# Status sollte "Verified" werden
```

---

## F) EMAIL_FROM auf Vercel umstellen

Sobald Resend `deepling.de` verifiziert hat:

```bash
vercel env rm EMAIL_FROM production --yes
echo "Deepling <no-reply@deepling.de>" | vercel env add EMAIL_FROM production
vercel redeploy https://fuehrungs-coach.vercel.app
```

Reply-To (für Coach-Follow-up-Mails, wenn User antwortet) im Code:
`lom@deepling.de` — geht dann in deine IONOS-Inbox.

---

## G) Smoke-Test

1. Bei Deepling eingeloggt → Settings → "Test-Mail senden"
   (oder Follow-up-Cron triggern)
2. Mail kommt von `no-reply@deepling.de`
3. SPF/DKIM/DMARC = `pass` (in Gmail: Original anzeigen)

Wenn DMARC = fail → DKIM-Record bei IONOS nochmal prüfen (Wert mit
Resend-Dashboard abgleichen, oft Leerzeichen oder Anführungszeichen
beim Copy-Paste verloren).
