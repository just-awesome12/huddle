-- =====================================================================
-- 041 — scheduler infrastructure (Phase 17) + inactivity nudges (D103)
-- =====================================================================
-- The project's first use of pg_cron — the long-deferred "scheduler"
-- infra unlock (panels D77/D78; the ceiling noted under Phase 16). A
-- daily job nudges groups that have gone quiet (no new ideas / decisions /
-- comments / wall posts in a while) but still have ideas waiting to be
-- decided, so the nudge is actionable ("you've got ideas — pick one?").
--
-- It reuses the send-push fan-out seam (D65): the job POSTs a synthetic
-- `group_nudge` payload to send-push (via pg_net, same Vault-or-dev-fallback
-- URL/secret as notify_send_push), which resolves it to a `nudge` event for
-- the group's members — so prefs, per-group mute, and BOTH delivery channels
-- (Expo + web push) all apply for free. No email provider needed.
--
-- pg_cron is preloaded in the Supabase stack (shared_preload_libraries) and
-- runs jobs from the `postgres` database (cron.database_name = postgres).
-- =====================================================================

create extension if not exists pg_cron;

-- When the group was last nudged — the daily job uses this as a cooldown so
-- a persistently-quiet group isn't re-nudged every single day.
alter table public.groups
  add column last_nudged_at timestamptz;

-- nudge opt-out (default-on, D66), like every other event pref.
alter table public.notification_prefs
  add column nudge boolean not null default true;

-- Recreate get_push_recipients to include the new `nudge` pref in the
-- aggregated jsonb (so @huddle/core can honour the nudge opt-out).
create or replace function public.get_push_recipients(
  p_group_id uuid,
  p_scope text,
  p_explicit_user_ids uuid[]
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with target as (
    select gm.user_id
      from public.group_members gm
      where p_scope = 'members' and gm.group_id = p_group_id
    union
    select gm.user_id
      from public.group_members gm
      where p_scope = 'admins' and gm.group_id = p_group_id and gm.role = 'admin'
    union
    select u.user_id
      from unnest(coalesce(p_explicit_user_ids, '{}'::uuid[])) as u(user_id)
      where p_scope = 'explicit'
  )
  select jsonb_build_object(
    'tokens', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'expo_token', t.expo_token))
      from public.push_tokens t
      where t.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'subs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.web_push_subscriptions s
      where s.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'prefs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', np.user_id,
        'new_idea', np.new_idea, 'picker_ran', np.picker_ran, 'group_invite', np.group_invite,
        'new_comment', np.new_comment, 'join_request', np.join_request,
        'join_approved', np.join_approved, 'reaction', np.reaction, 'rsvp', np.rsvp,
        'mention', np.mention, 'nudge', np.nudge))
      from public.notification_prefs np
      where np.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'muted', coalesce((
      select jsonb_agg(m.user_id)
      from public.group_notification_prefs m
      where m.group_id = p_group_id and m.muted = true
        and m.user_id in (select user_id from target)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_push_recipients(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.get_push_recipients(uuid, text, uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- Selection: which groups are quiet enough (and have something to pick)?
-- Kept as a pure SELECT helper so it's unit-testable (pgTAP) without the
-- HTTP side effect that the dispatcher adds.
-- ---------------------------------------------------------------------
create or replace function public.groups_needing_nudge(
  p_inactive_days int default 5,
  p_cooldown_days int default 7
)
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  select g.id
  from public.groups g
  where
    -- at least 2 on-radar ideas → the picker has something to decide
    (select count(*) from public.ideas i
       where i.group_id = g.id and i.status = 'on_radar') >= 2
    -- no recent activity across content tables (or the group itself)
    and greatest(
      g.created_at,
      coalesce((select max(i.created_at) from public.ideas i where i.group_id = g.id), g.created_at),
      coalesce((select max(d.created_at) from public.decisions d where d.group_id = g.id), g.created_at),
      coalesce((select max(co.created_at) from public.idea_comments co where co.group_id = g.id), g.created_at),
      coalesce((select max(po.created_at) from public.group_posts po where po.group_id = g.id), g.created_at)
    ) < now() - make_interval(days => p_inactive_days)
    -- per-group cooldown so we don't re-nudge daily
    and (g.last_nudged_at is null or g.last_nudged_at < now() - make_interval(days => p_cooldown_days));
$$;

revoke all on function public.groups_needing_nudge(int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Dispatcher: POST a synthetic `group_nudge` to send-push for each quiet
-- group, then stamp last_nudged_at. Mirrors notify_send_push's Vault-or-
-- dev-fallback URL/secret resolution. Returns the number nudged.
-- ---------------------------------------------------------------------
create or replace function public.dispatch_inactivity_nudges(
  p_inactive_days int default 5,
  p_cooldown_days int default 7
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  webhook_secret text;
  g_id uuid;
  n int := 0;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'send_push_url' limit 1;
  fn_url := coalesce(fn_url, 'http://host.docker.internal:54321/functions/v1/send-push');

  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'send_push_secret' limit 1;
  webhook_secret := coalesce(webhook_secret, 'local-dev-webhook-secret');

  for g_id in select public.groups_needing_nudge(p_inactive_days, p_cooldown_days)
  loop
    perform net.http_post(
      url := fn_url,
      body := jsonb_build_object(
        'type', 'SCHEDULED',
        'table', 'group_nudge',
        'record', jsonb_build_object('group_id', g_id)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-huddle-webhook-secret', webhook_secret
      )
    );
    update public.groups set last_nudged_at = now() where id = g_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.dispatch_inactivity_nudges(int, int) from public, anon, authenticated;

comment on function public.dispatch_inactivity_nudges(int, int) is
  'Phase 17: pg_cron daily job — POSTs a group_nudge to send-push for each quiet group and stamps last_nudged_at.';

-- ---------------------------------------------------------------------
-- Schedule: daily at 16:00 UTC. Idempotent across db reset (unschedule the
-- existing job by name first, then (re)create it).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'inactivity-nudges') then
    perform cron.unschedule('inactivity-nudges');
  end if;
end $$;

select cron.schedule(
  'inactivity-nudges',
  '0 16 * * *',
  $cron$ select public.dispatch_inactivity_nudges(); $cron$
);
