-- =====================================================================
-- 017 — Database Webhooks: fan out to send-push on INSERT (Phase 8)
-- =====================================================================
-- AFTER INSERT triggers on ideas / decisions / group_invites POST the
-- new row to the send-push Edge Function via pg_net (async HTTP). This
-- is the single fan-out seam: it fires regardless of which app or code
-- path created the row, including mobile-initiated writes.
--
-- send-push (verify_jwt off) authenticates the call with the
-- x-huddle-webhook-secret header — see migration note below.
--
-- LOCAL vs PROD (mirrors Turnstile D35/D37/D38):
--   * URL: host.docker.internal:54321 reaches the local edge runtime
--     from the db container. Production must point at the deployed
--     functions URL.
--   * SECRET: the committed value is the well-known DEV secret that
--     send-push falls back to locally. PRODUCTION must replace both this
--     trigger config and HUDDLE_WEBHOOK_SECRET with a real secret (a
--     follow-up migration or Supabase Dashboard webhook + Vault). Phase
--     9 adds the boot assertion that refuses the dev fallback in prod.
--
-- pg_net is async: the trigger only QUEUES the request and returns
-- immediately, so a slow/unreachable function never blocks the INSERT.
-- =====================================================================

create extension if not exists pg_net with schema extensions;


create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text := 'http://host.docker.internal:54321/functions/v1/send-push';
  webhook_secret text := 'local-dev-webhook-secret';
begin
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
  'Phase 8: POSTs the inserted row to the send-push Edge Function via pg_net. URL + secret are dev values; production must override (see migration 017).';


create trigger ideas_send_push
  after insert on public.ideas
  for each row execute function public.notify_send_push();

create trigger decisions_send_push
  after insert on public.decisions
  for each row execute function public.notify_send_push();

create trigger group_invites_send_push
  after insert on public.group_invites
  for each row execute function public.notify_send_push();
