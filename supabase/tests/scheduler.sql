-- =====================================================================
-- scheduler / inactivity-nudge test suite (Phase 17, D103)
-- =====================================================================
-- Coverage: pg_cron is installed + the daily job is registered; the new
-- columns exist; and groups_needing_nudge's selection logic — a quiet
-- group with ideas is picked, while a fresh group, a recently-nudged group
-- (cooldown), and a group with too few ideas are all excluded.
-- =====================================================================

begin;

select plan(10);

-- Infra is in place.
select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron extension is installed'
);
select ok(
  exists (select 1 from cron.job where jobname = 'inactivity-nudges' and active),
  'the inactivity-nudges cron job is registered and active'
);
select has_column('public', 'groups', 'last_nudged_at', 'groups.last_nudged_at exists');
select has_column('public', 'notification_prefs', 'nudge', 'notification_prefs.nudge exists');
select ok(
  exists (select 1 from pg_proc where proname = 'groups_needing_nudge'),
  'groups_needing_nudge() exists'
);
select ok(
  exists (select 1 from pg_proc where proname = 'dispatch_inactivity_nudges'),
  'dispatch_inactivity_nudges() exists'
);

-- ---------------------------------------------------------------------
-- Seed four groups with backdated activity to exercise the selection.
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'c50f0001-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'sched@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

-- STALE: quiet 30d, 2 on-radar ideas, never nudged → SHOULD be selected.
-- FRESH: created just now (recent activity) → excluded by recency.
-- NUDGED: quiet 30d, 2 ideas, but nudged yesterday → excluded by cooldown.
-- FEW: quiet 30d, only 1 on-radar idea → excluded (nothing to pick).
insert into public.groups (id, name, created_by, created_at, last_nudged_at) values
  ('c50f0001-0000-0000-0000-0000000000a2', 'Stale',  'c50f0001-0000-0000-0000-0000000000a1', now() - interval '30 days', null),
  ('c50f0001-0000-0000-0000-0000000000a3', 'Fresh',  'c50f0001-0000-0000-0000-0000000000a1', now(),                      null),
  ('c50f0001-0000-0000-0000-0000000000a4', 'Nudged', 'c50f0001-0000-0000-0000-0000000000a1', now() - interval '30 days', now() - interval '1 day'),
  ('c50f0001-0000-0000-0000-0000000000a5', 'Few',    'c50f0001-0000-0000-0000-0000000000a1', now() - interval '30 days', null);

insert into public.ideas (id, group_id, proposed_by, title, category, status, created_at) values
  -- Stale: 2 old ideas
  ('c50f0001-0000-0000-0000-0000000000b1', 'c50f0001-0000-0000-0000-0000000000a2', 'c50f0001-0000-0000-0000-0000000000a1', 'S1', 'food', 'on_radar', now() - interval '30 days'),
  ('c50f0001-0000-0000-0000-0000000000b2', 'c50f0001-0000-0000-0000-0000000000a2', 'c50f0001-0000-0000-0000-0000000000a1', 'S2', 'food', 'on_radar', now() - interval '30 days'),
  -- Fresh: 2 recent ideas
  ('c50f0001-0000-0000-0000-0000000000b3', 'c50f0001-0000-0000-0000-0000000000a3', 'c50f0001-0000-0000-0000-0000000000a1', 'F1', 'food', 'on_radar', now()),
  ('c50f0001-0000-0000-0000-0000000000b4', 'c50f0001-0000-0000-0000-0000000000a3', 'c50f0001-0000-0000-0000-0000000000a1', 'F2', 'food', 'on_radar', now()),
  -- Nudged: 2 old ideas
  ('c50f0001-0000-0000-0000-0000000000b5', 'c50f0001-0000-0000-0000-0000000000a4', 'c50f0001-0000-0000-0000-0000000000a1', 'N1', 'food', 'on_radar', now() - interval '30 days'),
  ('c50f0001-0000-0000-0000-0000000000b6', 'c50f0001-0000-0000-0000-0000000000a4', 'c50f0001-0000-0000-0000-0000000000a1', 'N2', 'food', 'on_radar', now() - interval '30 days'),
  -- Few: 1 old idea
  ('c50f0001-0000-0000-0000-0000000000b7', 'c50f0001-0000-0000-0000-0000000000a5', 'c50f0001-0000-0000-0000-0000000000a1', 'X1', 'food', 'on_radar', now() - interval '30 days');

select ok(
  (select count(*) from public.groups_needing_nudge(5, 7) g
     where g = 'c50f0001-0000-0000-0000-0000000000a2') = 1,
  'a quiet group with >=2 on-radar ideas is selected'
);
select ok(
  (select count(*) from public.groups_needing_nudge(5, 7) g
     where g = 'c50f0001-0000-0000-0000-0000000000a3') = 0,
  'a group with recent activity is NOT selected'
);
select ok(
  (select count(*) from public.groups_needing_nudge(5, 7) g
     where g = 'c50f0001-0000-0000-0000-0000000000a4') = 0,
  'a recently-nudged group is NOT selected (cooldown)'
);
select ok(
  (select count(*) from public.groups_needing_nudge(5, 7) g
     where g = 'c50f0001-0000-0000-0000-0000000000a5') = 0,
  'a group with fewer than 2 on-radar ideas is NOT selected'
);

select * from finish();
rollback;
