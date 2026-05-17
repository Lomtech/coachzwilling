#!/usr/bin/env bash
# Vercel-Deploy: linkt Projekt, pusht alle Env-Vars, deployt auf Production.
#
# Setup: erst einmalig `vercel login` ausführen, dann:
#   bash scripts/vercel-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "❌ .env.local fehlt"; exit 1
fi

# Login-Check
if ! vercel whoami >/dev/null 2>&1; then
  echo "❌ Nicht eingeloggt. Führe zuerst aus:"
  echo "   vercel login"
  exit 1
fi

# 1) Projekt linken (idempotent)
if [ ! -f .vercel/project.json ]; then
  echo "→ Vercel-Projekt linken …"
  vercel link --yes --project=fuehrungs-coach 2>&1 || vercel link --yes
fi

# 2) Env-Variablen pushen
echo "→ Env-Variablen pushen …"

push_env() {
  local key="$1"
  local val="$2"
  if [ -z "$val" ]; then return; fi
  # Vorhandene Vars für Production entfernen (idempotent)
  vercel env rm "$key" production --yes 2>/dev/null || true
  printf "%s" "$val" | vercel env add "$key" production
}

# .env.local einlesen
set -a; source .env.local; set +a

push_env "NEXT_PUBLIC_SUPABASE_URL"        "${NEXT_PUBLIC_SUPABASE_URL:-}"
push_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"   "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
push_env "SUPABASE_SERVICE_ROLE_KEY"       "${SUPABASE_SERVICE_ROLE_KEY:-}"
push_env "ANTHROPIC_API_KEY"               "${ANTHROPIC_API_KEY:-}"
push_env "CLAUDE_COACH_MODEL"              "${CLAUDE_COACH_MODEL:-claude-sonnet-4-6}"
push_env "CLAUDE_PROFILER_MODEL"           "${CLAUDE_PROFILER_MODEL:-claude-opus-4-7}"
push_env "STRIPE_SECRET_KEY"               "${STRIPE_SECRET_KEY:-}"
push_env "STRIPE_PRICE_MONTHLY"            "${STRIPE_PRICE_MONTHLY:-}"
push_env "STRIPE_PRICE_YEARLY"             "${STRIPE_PRICE_YEARLY:-}"
# STRIPE_WEBHOOK_SECRET pushen wir später, wenn der Webhook angelegt ist

# 3) Deploy
echo "→ Deploy zu Production …"
URL=$(vercel deploy --prod --yes 2>&1 | tee /dev/stderr | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)

if [ -z "$URL" ]; then
  echo "❌ Konnte Deploy-URL nicht extrahieren"
  exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "  Deploy fertig: $URL"
echo "════════════════════════════════════════"
echo ""
echo "→ Setze noch NEXT_PUBLIC_APP_URL …"
vercel env rm NEXT_PUBLIC_APP_URL production --yes 2>/dev/null || true
printf "%s" "$URL" | vercel env add NEXT_PUBLIC_APP_URL production

echo "→ Webhook im Live-Stripe anlegen …"
node scripts/setup-stripe.mjs --webhook "$URL/api/stripe/webhook"

echo ""
echo "✅ Fertig. Trage STRIPE_WEBHOOK_SECRET in Vercel ein und re-deploy mit:"
echo "   vercel --prod"
