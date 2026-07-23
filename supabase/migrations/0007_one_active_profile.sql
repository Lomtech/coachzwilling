-- 0007_one_active_profile.sql
-- Genau EIN aktives Coach-Profil pro Nutzer — auf DB-Ebene erzwungen.
--
-- Warum: Am 01.06. liefen für einen Nutzer drei auto_refresh-Läufe in derselben
-- Sekunde. Jeder machte „alte deaktivieren, dann neues einfügen" — das ist NICHT
-- atomar, also blieben am Ende drei Profile aktiv. Folgen:
--   • der Chat lädt per order(generated_at desc).limit(1) — bei identischem
--     Zeitstempel nicht-deterministisch, der Coach „springt" zwischen Versionen
--   • settings/page.tsx lud mit .maybeSingle() OHNE limit → Fehler bei >1 Zeile
--     → die Seite zeigte „kein Coach-Profil" obwohl drei existierten
--
-- Mit diesem partiellen Unique-Index gewinnt bei einem Rennen genau ein Insert,
-- die anderen scheitern laut (Unique-Violation) statt still Daten zu verfälschen.
-- Der normale Ablauf (erst deaktivieren, dann einfügen, sequenziell in EINEM
-- Request) ist davon nicht betroffen.

create unique index if not exists coach_profiles_one_active_per_user
  on public.coach_profiles (user_id)
  where is_active;

comment on index public.coach_profiles_one_active_per_user is
  'Erzwingt max. ein aktives Profil pro Nutzer. Verhindert die Mehrfach-Aktiv-Race aus nebenläufigen Refresh-Läufen.';
