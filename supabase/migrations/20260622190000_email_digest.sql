-- =====================================================================
-- 042 — weekly email digest (Phase 16, slice 16e; D104)
-- =====================================================================
-- The panel's last engagement item, unblocked by Phase 17's scheduler.
-- A weekly pg_cron job POSTs to the new `send-digest` Edge Function, which
-- composes a per-user recap of their groups' recent activity and emails it
-- (Resend in prod; a dry-run path for tests — no email provider needed to
-- build/verify, mirroring send-push's D67 dry-run).
--
-- This is EMAIL, not push: `notification_prefs.digest` is a separate opt-out
-- (default-on, D66) and is deliberately NOT added to get_push_recipients /
-- @huddle/core push selection — it gates only the digest.
-- =====================================================================

alter table public.notification_prefs
  add column digest boolean not null default true;

-- When the user last received a digest — the weekly job uses it as a guard
-- so a retried/extra run doesn't double-send within the window.
alter table public.profiles
  add column last_digest_at timestamptz;

-- ---------------------------------------------------------------------
-- Eligible recipients: digest not opted out, an onboarded (non-placeholder,
-- D31) account with an email, and not already digested within the cooldown.
-- A pure setof so it's pgTAP-testable without the email side effect.
-- ---------------------------------------------------------------------
create or replace function public.digest_eligible_users(p_cooldown_days int default 6)
returns table(user_id uuid, email text, last_digest_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select p.id, u.email, p.last_digest_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.notification_prefs np on np.user_id = p.id
  where coalesce(np.digest, true) = true
    and p.username not like 'u\_%'
    and u.email is not null
    and (p.last_digest_at is null or p.last_digest_at < now() - make_interval(days => p_cooldown_days));
$$;

revoke all on function public.digest_eligible_users(int) from public, anon, authenticated;
grant execute on function public.digest_eligible_users(int) to service_role;

-- ---------------------------------------------------------------------
-- Per-user activity since `p_since`, aggregated across the user's groups.
-- Returns a jsonb array of only the groups that have something to report.
-- ---------------------------------------------------------------------
create or replace function public.get_user_digest(p_user uuid, p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with my_groups as (
    select gm.group_id, g.name
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = p_user
  ),
  per_group as (
    select jsonb_build_object(
      'group_id', mg.group_id,
      'name', mg.name,
      'new_ideas', coalesce((
        select jsonb_agg(i.title order by i.created_at desc)
        from public.ideas i
        where i.group_id = mg.group_id and i.created_at >= p_since
      ), '[]'::jsonb),
      'decisions', (
        select count(*) from public.decisions d
        where d.group_id = mg.group_id and d.created_at >= p_since),
      'comments', (
        select count(*) from public.idea_comments c
        where c.group_id = mg.group_id and c.created_at >= p_since),
      'posts', (
        select count(*) from public.group_posts po
        where po.group_id = mg.group_id and po.created_at >= p_since),
      'upcoming', coalesce((
        select jsonb_agg(jsonb_build_object('title', i.title, 'date', i.event_date) order by i.event_date)
        from public.ideas i
        where i.group_id = mg.group_id and i.status = 'on_radar'
          and i.event_date is not null
          and i.event_date >= (now() at time zone 'utc')::date
      ), '[]'::jsonb)
    ) as grp
    from my_groups mg
  )
  select coalesce(jsonb_agg(grp order by grp->>'name'), '[]'::jsonb)
  from per_group
  where grp->'new_ideas' <> '[]'::jsonb
     or (grp->>'decisions')::int > 0
     or (grp->>'comments')::int > 0
     or (grp->>'posts')::int > 0
     or grp->'upcoming' <> '[]'::jsonb;
$$;

revoke all on function public.get_user_digest(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_user_digest(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- Cron entry point: POST to send-digest (Vault-or-dev-fallback URL; reuses
-- the send_push_secret for webhook auth, like the nudge dispatcher).
-- ---------------------------------------------------------------------
create or replace function public.dispatch_weekly_digest()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  webhook_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'send_digest_url' limit 1;
  fn_url := coalesce(fn_url, 'http://host.docker.internal:54321/functions/v1/send-digest');

  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'send_push_secret' limit 1;
  webhook_secret := coalesce(webhook_secret, 'local-dev-webhook-secret');

  perform net.http_post(
    url := fn_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-huddle-webhook-secret', webhook_secret
    )
  );
end;
$$;

comment on function public.dispatch_weekly_digest() is
  'Phase 16e: pg_cron weekly job — POSTs to send-digest, which composes + emails per-user recaps.';

-- Weekly, Monday 15:00 UTC. Idempotent across db reset.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-digest') then
    perform cron.unschedule('weekly-digest');
  end if;
end $$;

select cron.schedule(
  'weekly-digest',
  '0 15 * * 1',
  $cron$ select public.dispatch_weekly_digest(); $cron$
);
