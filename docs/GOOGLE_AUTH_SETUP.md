# Google OAuth — Setup

Code-Seite ist fertig (Google-Button auf `/login` und `/signup`, Trigger zieht den Namen aus `raw_user_meta_data`). Damit der Klick funktioniert, brauchst du noch **2 Dashboard-Steps**:

## 1. Google Cloud Console (5 Min)

1. **Projekt anlegen** (oder bestehendes wählen) → https://console.cloud.google.com/
2. **OAuth Consent Screen** konfigurieren:
   - APIs & Services → OAuth consent screen
   - User Type: `External` (für öffentliche App) oder `Internal` (falls Workspace-Domain)
   - App-Name: `Deepling`
   - User support email: deine
   - Authorized domains: `vercel.app` (+ deine Custom-Domain wenn vorhanden)
   - Scopes: `email`, `profile`, `openid` reichen
   - Test-User: deine eigene Mail (während "Testing" / "Unverified" Status)
3. **OAuth 2.0 Client ID** erstellen:
   - APIs & Services → Credentials → Create credentials → OAuth client ID
   - Application type: **Web application**
   - Name: `Deepling Web`
   - **Authorized redirect URIs** (kritisch — exakt so eintragen):
     ```
     https://wlxolfkhkxembiuofmfa.supabase.co/auth/v1/callback
     ```
   - **Create** → kopier dir `Client ID` + `Client Secret`

## 2. Supabase Dashboard (1 Min)

1. https://supabase.com/dashboard/project/wlxolfkhkxembiuofmfa/auth/providers
2. Scroll zu **Google** → toggle **Enable**
3. Eintragen:
   - **Client ID** = Google `Client ID`
   - **Client Secret** = Google `Client Secret`
4. **Save**

## 3. Testen

1. Öffne https://fuehrungs-coach.vercel.app/login
2. Klick „Mit Google fortfahren"
3. Google-Login-Flow durchgehen
4. Du landest auf `/coach` (oder `/onboarding` wenn neuer User)

## Fallstricke

| Symptom | Ursache | Fix |
|---|---|---|
| „redirect_uri_mismatch" bei Google | Falsche URI in der Cloud Console | Genau `https://wlxolfkhkxembiuofmfa.supabase.co/auth/v1/callback` — kein Trailing-Slash |
| „Access blocked: This app's request is invalid" | Consent-Screen unvollständig | Scopes + Test-User in der Cloud Console nachpflegen |
| Login klappt, aber `full_name` ist null | Trigger zieht noch alte Felder | Bereits behoben — Trigger nimmt jetzt `full_name` ODER `name` aus raw_user_meta_data |
| App im "Testing"-Mode, nur Test-User können sich anmelden | Cloud Console „Publishing status: Testing" | Auf „In production" pushen sobald App-Verifikation durch ist (für nur-eigene-Nutzung egal) |

## Was passiert technisch

```
[Klick Button]
   ↓
supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '<unsere>/api/auth/callback' })
   ↓
→ https://accounts.google.com/o/oauth2/auth?...
   ↓
[User klickt "Mit Google fortfahren" auf Google]
   ↓
→ https://wlxolfkhkxembiuofmfa.supabase.co/auth/v1/callback?code=...
   ↓
[Supabase legt User in auth.users an + ruft Trigger]
   ↓
→ unsere App /api/auth/callback?code=...&next=/coach
   ↓
[supabase.auth.exchangeCodeForSession → Session-Cookie gesetzt]
   ↓
→ /coach
```

Der Custom-Domain-Wechsel später (z.B. `coach.osss.pro`) braucht nichts an Google-Side, weil der Redirect immer über Supabase läuft.
