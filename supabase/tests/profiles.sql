-- =====================================================================
-- profiles test suite
-- =====================================================================
-- Run with: supabase test db
--
-- Coverage:
--   - Extension presence
--   - Table structure (key columns, types, defaults)
--   - Username CHECK constraint (positive + negative)
--   - Username lowercase trigger
--   - Auto-create profile trigger on auth.users insert
--   - RLS: anon cannot read profiles
--   - RLS: authenticated CAN read any profile
--   - RLS: authenticated can only update OWN profile
--   - RLS: INSERT is denied via the API
--   - RLS: DELETE is denied via the API
-- =====================================================================

begin;

select plan(19);


-- ---------------------------------------------------------------------
-- Section 1 — Structure
-- ---------------------------------------------------------------------
select has_extension('pgcrypto', 'pgcrypto extension is enabled');

select has_table('public', 'profiles', 'profiles table exists');

select columns_are(
  'public', 'profiles',
  array['id', 'username', 'display_name', 'avatar_url', 'bio', 'created_at', 'updated_at',
        'last_digest_at'],
  'profiles has the expected columns'
);

select col_is_pk('public', 'profiles', 'id', 'id is the primary key');

select col_is_unique('public', 'profiles', array['username'], 'username is unique');


-- ---------------------------------------------------------------------
-- Section 2 — Username constraint
-- ---------------------------------------------------------------------
-- We use a real auth.users row so the FK and trigger machinery exercise
-- end-to-end. Create one as the superuser (bypasses RLS).

set local role postgres;

-- Create a user. The on_auth_user_created trigger will create a profile
-- automatically with a placeholder username.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'decade01-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'alice@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb,
  now(), now()
);

select isnt_empty(
  $$select 1 from public.profiles where id = 'decade01-1111-1111-1111-111111111111'$$,
  'on_auth_user_created trigger creates a profile row'
);

select is(
  (select username from public.profiles where id = 'decade01-1111-1111-1111-111111111111'),
  'u_decade011111',
  'placeholder username is derived from UUID (12 hex chars after prefix)'
);

-- Bad username should be rejected by CHECK constraint.
select throws_ok(
  $$update public.profiles
    set username = 'AB'
    where id = 'decade01-1111-1111-1111-111111111111'$$,
  '23514',  -- check_violation
  null,
  'username shorter than 3 chars is rejected'
);

select throws_ok(
  $$update public.profiles
    set username = 'has-dashes-not-allowed'
    where id = 'decade01-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'username with disallowed chars is rejected'
);

-- Mixed-case username should be lowercased by the trigger and accepted.
update public.profiles
  set username = 'AliceWonderland'
  where id = 'decade01-1111-1111-1111-111111111111';

select is(
  (select username from public.profiles where id = 'decade01-1111-1111-1111-111111111111'),
  'alicewonderland',
  'username is auto-lowercased on update'
);


-- ---------------------------------------------------------------------
-- Section 3 — RLS: anonymous role
-- ---------------------------------------------------------------------
-- Switch to the `anon` role (Supabase's unauthenticated client role).
set local role anon;

select is_empty(
  $$select 1 from public.profiles$$,
  'anon role cannot read any profiles'
);


-- ---------------------------------------------------------------------
-- Section 4 — RLS: authenticated role can read any profile
-- ---------------------------------------------------------------------
-- Create a second user as superuser.
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'decade02-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'bob@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb,
  now(), now()
);

-- Now act as Bob. RLS is keyed off auth.uid(), which reads from the
-- request.jwt.claims setting.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.profiles where id = 'decade01-1111-1111-1111-111111111111'$$,
  'authenticated user can read another user''s profile'
);

select isnt_empty(
  $$select 1 from public.profiles where id = 'decade02-2222-2222-2222-222222222222'$$,
  'authenticated user can read their own profile'
);


-- ---------------------------------------------------------------------
-- Section 5 — RLS: authenticated can update OWN profile, not others
-- ---------------------------------------------------------------------
-- Still acting as Bob.

-- Bob updates his own display_name → should succeed.
update public.profiles
  set display_name = 'Bob the Builder'
  where id = 'decade02-2222-2222-2222-222222222222';

select is(
  (select display_name from public.profiles where id = 'decade02-2222-2222-2222-222222222222'),
  'Bob the Builder',
  'user can update their own profile'
);

-- Bob tries to update Alice's display_name. RLS makes the row invisible
-- to the UPDATE, so the statement succeeds but affects 0 rows — Alice's
-- display_name stays as the placeholder username.
update public.profiles
  set display_name = 'Hacked by Bob'
  where id = 'decade01-1111-1111-1111-111111111111';

select isnt(
  (select display_name from public.profiles where id = 'decade01-1111-1111-1111-111111111111'),
  'Hacked by Bob',
  'user CANNOT update another user''s profile (RLS hides the row from UPDATE)'
);


-- ---------------------------------------------------------------------
-- Section 6 — RLS: INSERT denied for authenticated role
-- ---------------------------------------------------------------------
-- There is no INSERT policy, so any direct INSERT via the API must fail.
-- (The handle_new_user() trigger is SECURITY DEFINER and unaffected.)

select throws_ok(
  $$insert into public.profiles (id, username, display_name)
    values (gen_random_uuid(), 'sneaky', 'Sneaky')$$,
  '42501',  -- insufficient_privilege (RLS denial)
  null,
  'authenticated user cannot directly INSERT into profiles'
);


-- ---------------------------------------------------------------------
-- Section 7 — RLS: DELETE denied for authenticated role
-- ---------------------------------------------------------------------
-- Same logic — no DELETE policy means deletes go through 0 rows.
-- We assert that Bob's profile still exists after he tries to delete it.

delete from public.profiles where id = 'decade02-2222-2222-2222-222222222222';

select isnt_empty(
  $$select 1 from public.profiles where id = 'decade02-2222-2222-2222-222222222222'$$,
  'authenticated user cannot DELETE their own profile (deletion is auth.users-cascade only)'
);


-- ---------------------------------------------------------------------
-- Section 8 — Trigger-created profile passes username validation
-- ---------------------------------------------------------------------
-- We already inserted a third UUID-derived placeholder above. Verify
-- it matches the regex (it would have been rejected on insert if not).
set local role postgres;

select matches(
  (select username from public.profiles where id = 'decade02-2222-2222-2222-222222222222'),
  '^[a-z0-9_]{3,30}$',
  'placeholder username matches the username regex'
);


-- ---------------------------------------------------------------------
-- Section 9 — updated_at maintenance
-- ---------------------------------------------------------------------
-- Capture the current updated_at, sleep a moment, update, confirm change.
do $$
declare
  before_ts timestamptz;
  after_ts timestamptz;
begin
  select updated_at into before_ts
    from public.profiles
    where id = 'decade02-2222-2222-2222-222222222222';

  perform pg_sleep(0.01);

  update public.profiles
    set display_name = 'Bob v2'
    where id = 'decade02-2222-2222-2222-222222222222';

  select updated_at into after_ts
    from public.profiles
    where id = 'decade02-2222-2222-2222-222222222222';

  if after_ts <= before_ts then
    raise exception 'updated_at did not advance on UPDATE';
  end if;
end $$;

select pass('updated_at advances on UPDATE');


select * from finish();
rollback;
