-- =====================================================================
-- notification_prefs test suite (Phase 8)
-- =====================================================================
-- Coverage:
--   - Structure + defaults (all events default true)
--   - RLS: anon cannot read
--   - RLS: user reads/writes only own row
--   - RLS: user cannot INSERT a row for another user
--   - RLS: user cannot reassign user_id via UPDATE
--   - Cascade: deleting the user removes their prefs
-- =====================================================================

begin;
select plan(8);


-- ---------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------
select has_table('public', 'notification_prefs', 'notification_prefs table exists');


-- ---------------------------------------------------------------------
-- Seed users
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'decade01-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade02-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bob@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());


-- ---------------------------------------------------------------------
-- Alice creates her prefs row; defaults are all true
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.notification_prefs (user_id) values
  ('decade01-1111-1111-1111-111111111111');

set local role postgres;
select is(
  (select (new_idea and picker_ran and group_invite and new_comment)
   from public.notification_prefs
   where user_id = 'decade01-1111-1111-1111-111111111111'),
  true,
  'a new prefs row defaults every event to enabled'
);


-- ---------------------------------------------------------------------
-- RLS: anon
-- ---------------------------------------------------------------------
set local role anon;
select is_empty(
  $$select 1 from public.notification_prefs$$,
  'anon role cannot read notification_prefs'
);


-- ---------------------------------------------------------------------
-- RLS: SELECT — own only
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';
select isnt_empty(
  $$select 1 from public.notification_prefs
    where user_id = 'decade01-1111-1111-1111-111111111111'$$,
  'user can read their own prefs'
);

set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.notification_prefs
    where user_id = 'decade01-1111-1111-1111-111111111111'$$,
  'user CANNOT read another user''s prefs'
);


-- ---------------------------------------------------------------------
-- RLS: INSERT — user_id must equal auth.uid()
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.notification_prefs (user_id, new_idea)
    values ('decade01-1111-1111-1111-111111111111', false)$$,
  '42501',
  null,
  'user CANNOT INSERT prefs for another user'
);


-- ---------------------------------------------------------------------
-- RLS: UPDATE — cannot reassign user_id (WITH CHECK rejects the new row)
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';
select throws_ok(
  $$update public.notification_prefs
      set user_id = 'decade02-2222-2222-2222-222222222222'
      where user_id = 'decade01-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'user CANNOT reassign their prefs row to another user (WITH CHECK)'
);
set local role postgres;


-- ---------------------------------------------------------------------
-- Cascade
-- ---------------------------------------------------------------------
delete from auth.users where id = 'decade01-1111-1111-1111-111111111111';
select is_empty(
  $$select 1 from public.notification_prefs
    where user_id = 'decade01-1111-1111-1111-111111111111'$$,
  'deleting a user cascades to remove their prefs'
);


select * from finish();
rollback;
