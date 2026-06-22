#!/usr/bin/env bash
# =====================================================================
# Huddle — set production Edge Function secrets + print Vault SQL (TEMPLATE)
# =====================================================================
# Reads values from the ENVIRONMENT — it never hardcodes secrets. Run it in
# a secure shell (the values are passed to the supabase CLI and printed for
# the Vault step). See the secrets table in docs/LAUNCH.md.
#
# Required:
#   SUPABASE_PROJECT_REF   prod project ref
#   HUDDLE_WEBHOOK_SECRET  strong random; shared by send-push + send-digest
#                          and reused as the Vault send_push_secret
# Optional (features degrade gracefully if unset):
#   VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT   web push (D89)
#   RESEND_API_KEY RESEND_FROM DIGEST_APP_URL          email digest (D104)
#
# Usage:
#   SUPABASE_PROJECT_REF=abcd1234 HUDDLE_WEBHOOK_SECRET=… \
#     [RESEND_API_KEY=… …] bash scripts/setup-prod-secrets.sh
# =====================================================================

set -euo pipefail

: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF}"
: "${HUDDLE_WEBHOOK_SECRET:?set HUDDLE_WEBHOOK_SECRET (strong random)}"

command -v supabase >/dev/null 2>&1 || { echo "supabase CLI is required"; exit 1; }

# Build the secrets list: required first, then any optional ones that are set.
args=( "HUDDLE_WEBHOOK_SECRET=${HUDDLE_WEBHOOK_SECRET}" )
for name in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT \
            RESEND_API_KEY RESEND_FROM DIGEST_APP_URL; do
  if [ -n "${!name:-}" ]; then
    args+=( "${name}=${!name}" )
  else
    echo "note: ${name} not set — the dependent feature stays off in prod"
  fi
done

echo "==> Setting Edge Function secrets on ${SUPABASE_PROJECT_REF}"
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${args[@]}"

cat <<SQL

==> Now run this in the prod SQL editor to point the pg_net triggers + cron
    jobs at the deployed functions (Vault; see docs/LAUNCH.md):

select vault.create_secret('https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/send-push', 'send_push_url');
select vault.create_secret('https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/send-digest', 'send_digest_url');
select vault.create_secret('${HUDDLE_WEBHOOK_SECRET}', 'send_push_secret');
SQL
