-- =====================================================================
-- 020 — make send-push fan-out production-configurable (Phase 10 / D65)
-- =====================================================================
-- Migration 017 hardcoded the send-push URL + webhook secret to local
-- dev values, so production push never fires. Read them from Supabase
-- Vault instead, falling back to the dev values when the vault rows are
-- absent (i.e. locally). The triggers are unchanged — only the function.
--
-- PRODUCTION SETUP (run once against the prod project, e.g. via SQL
-- editor — keeps the secret out of git):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-push', 'send_push_url');
--   select vault.create_secret('<a-strong-random-secret>', 'send_push_secret');
-- and set the same value as the send-push function's HUDDLE_WEBHOOK_SECRET
--   supabase secrets set HUDDLE_WEBHOOK_SECRET=<same-strong-random-secret>
-- =====================================================================

create extension if not exists supabase_vault;

create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  webhook_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'send_push_url' limit 1;
  fn_url := coalesce(fn_url, 'http://host.docker.internal:54321/functions/v1/send-push');

  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'send_push_secret' limit 1;
  webhook_secret := coalesce(webhook_secret, 'local-dev-webhook-secret');

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-huddle-webhook-secret', webhook_secret
    )
  );
  return new;
end;
$$;

comment on function public.notify_send_push() is
  'Phase 10: POSTs inserted rows to send-push via pg_net. URL + secret come from Vault (send_push_url / send_push_secret) with a local dev fallback.';
