#!/usr/bin/env bash
# =====================================================================
# Huddle — production deploy (TEMPLATE)
# =====================================================================
# Pushes the schema + Edge Functions to the production Supabase project.
# Run AFTER the prod project exists and Tier 1 of docs/LAUNCH.md is done.
# This script contains NO secrets — set those with
# scripts/setup-prod-secrets.sh and the Vault SQL it prints.
#
# Prereqs:
#   - supabase CLI logged in (`supabase login`)
#   - SUPABASE_PROJECT_REF set to your prod project ref
#
# Usage:
#   SUPABASE_PROJECT_REF=abcd1234 bash scripts/deploy-prod.sh
# =====================================================================

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF to your prod project ref}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v supabase >/dev/null 2>&1 || { echo "supabase CLI is required"; exit 1; }

echo "==> Linking to project ${SUPABASE_PROJECT_REF}"
supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "==> Pushing migrations (schema only — seed.sql is NOT applied in prod)"
supabase db push

echo "==> Deploying Edge Functions"
for fn in run_picker send-push send-digest delete-account; do
  echo "    - $fn"
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
done

cat <<'NEXT'

==> Deploy steps done. Remaining (see docs/LAUNCH.md Tier 2):
    1. scripts/setup-prod-secrets.sh   — Edge Function secrets + Vault URLs
    2. Supabase dashboard              — Google OAuth, the magic_link OTP
                                         template, enable_confirmations
    3. Verify pg_cron jobs             — select * from cron.job;
    4. Deploy web to Vercel            — custom domain + the NEXT_PUBLIC_* env
    5. Cloudflare perimeter + Sentry
NEXT
