-- =====================================================================
-- email digest test suite (Phase 16e, D104)
-- =====================================================================
-- Coverage: the digest columns + weekly cron job + functions exist; and
-- digest_eligible_users' selection (opt-out, placeholder accounts, and the
-- cooldown are all excluded) + get_user_digest's per-group aggregation.
-- =====================================================================

begin;

select plan(12);

select has_column('public', 'notification_prefs', 'digest', 'notification_prefs.digest exists');
select has_column('public', 'profiles', 'last_digest_at', 'profiles.last_digest_at exists');
select ok(
  exists (select 1 from cron.job where jobname = 'weekly-digest' and active),
  'the weekly-digest cron job is registered and active'
);
select ok(exists (select 1 from pg_proc where proname = 'digest_eligible_users'),
  'digest_eligible_users() exists');
select ok(exists (select 1 from pg_proc where proname = 'get_user_digest'),
  'get_user_digest() exists');
select ok(exists (select 1 from pg_proc where proname = 'dispatch_weekly_digest'),
  'dispatch_weekly_digest() exists');

-- ---------------------------------------------------------------------
-- Seed four users (profiles auto-created by handle_new_user, D31):
--   U   — onboarded, digest on, member of an active group  → eligible
--   OUT — onboarded, digest OFF                            → excluded
--   PLH — left with the placeholder username (un-onboarded)→ excluded
--   RCT — onboarded but digested just now (cooldown)       → excluded
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'd1100011-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'dg_u@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1100022-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'dg_out@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1100033-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'dg_plh@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1100044-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'dg_rct@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- Onboard U, OUT, RCT with real usernames; leave PLH as the u_ placeholder.
update public.profiles set username = 'dg_u'   where id = 'd1100011-0000-0000-0000-000000000001';
update public.profiles set username = 'dg_out' where id = 'd1100022-0000-0000-0000-000000000002';
update public.profiles set username = 'dg_rct', last_digest_at = now()
  where id = 'd1100044-0000-0000-0000-000000000004';

insert into public.notification_prefs (user_id, digest)
  values ('d1100022-0000-0000-0000-000000000002', false);

-- U's active group + a recent idea.
insert into public.groups (id, name, created_by)
  values ('d1100001-0000-0000-0000-00000000000a', 'Digest G', 'd1100011-0000-0000-0000-000000000001');
insert into public.ideas (id, group_id, proposed_by, title, category, status)
  values ('d1100001-0000-0000-0000-00000000000b', 'd1100001-0000-0000-0000-00000000000a',
          'd1100011-0000-0000-0000-000000000001', 'Tacos', 'food', 'on_radar');

select ok(
  (select count(*) from public.digest_eligible_users(6) e
     where e.user_id = 'd1100011-0000-0000-0000-000000000001') = 1,
  'an onboarded, digest-on user is eligible'
);
select ok(
  (select count(*) from public.digest_eligible_users(6) e
     where e.user_id = 'd1100022-0000-0000-0000-000000000002') = 0,
  'a user who opted out of the digest is NOT eligible'
);
select ok(
  (select count(*) from public.digest_eligible_users(6) e
     where e.user_id = 'd1100033-0000-0000-0000-000000000003') = 0,
  'a placeholder (un-onboarded) account is NOT eligible'
);
select ok(
  (select count(*) from public.digest_eligible_users(6) e
     where e.user_id = 'd1100044-0000-0000-0000-000000000004') = 0,
  'a recently-digested user is NOT eligible (cooldown)'
);

select is(
  (select public.get_user_digest('d1100011-0000-0000-0000-000000000001', now() - interval '7 days')
     -> 0 ->> 'name'),
  'Digest G',
  'get_user_digest reports the active group for the member'
);
select is(
  public.get_user_digest('d1100033-0000-0000-0000-000000000003', now() - interval '7 days'),
  '[]'::jsonb,
  'get_user_digest is empty for a user with no group activity'
);

select * from finish();
rollback;
