-- =====================================================================
-- group_members test suite (Phase 1.3)
-- =====================================================================
-- Coverage:
--   - Structure
--   - on_group_created trigger adds creator as admin
--   - RLS: anon cannot read
--   - RLS: SELECT visible only to members of the same group
--   - RLS: INSERT denied for all authenticated callers (no client path)
--   - RLS: UPDATE role only by admins
--   - RLS: DELETE — self-leave allowed
--   - RLS: DELETE — admin can kick a member
--   - RLS: DELETE — non-admin cannot kick another member
--   - Last-admin protection: cannot leave as last admin
--   - Last-admin protection: cannot demote last admin
--   - Last-admin protection: can leave if another admin exists
-- =====================================================================

begin;

select plan(17);


-- ---------------------------------------------------------------------
-- Section 1 — Structure
-- ---------------------------------------------------------------------
select has_table('public', 'group_members', 'group_members table exists');

select columns_are(
  'public', 'group_members',
  array['group_id', 'user_id', 'role', 'joined_at'],
  'group_members has the expected columns'
);

select col_is_pk(
  'public', 'group_members', array['group_id', 'user_id'],
  '(group_id, user_id) is the composite primary key'
);


-- ---------------------------------------------------------------------
-- Section 2 — Seed users and groups (as superuser, bypassing RLS)
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
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade03-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'carol@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Alice creates a group. The on_group_created trigger should add her
-- as an admin member.
insert into public.groups (id, name, created_by)
values (
  '1ea61111-1111-1111-1111-111111111111',
  'Alice''s Crew',
  'decade01-1111-1111-1111-111111111111'
);


-- ---------------------------------------------------------------------
-- Section 3 — on_group_created trigger
-- ---------------------------------------------------------------------
select is(
  (select role::text from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'
     and user_id = 'decade01-1111-1111-1111-111111111111'),
  'admin',
  'group creator is automatically added as admin'
);

select is(
  (select count(*)::int from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'),
  1,
  'new group has exactly one member (the creator)'
);


-- ---------------------------------------------------------------------
-- Section 4 — RLS: anon
-- ---------------------------------------------------------------------
set local role anon;

select is_empty(
  $$select 1 from public.group_members$$,
  'anon role cannot read group_members'
);


-- ---------------------------------------------------------------------
-- Section 5 — RLS: SELECT visible only to members of same group
-- ---------------------------------------------------------------------
-- Add Bob to Alice's group (as superuser, since no INSERT policy exists).
set local role postgres;
insert into public.group_members (group_id, user_id, role)
values (
  '1ea61111-1111-1111-1111-111111111111',
  'decade02-2222-2222-2222-222222222222',
  'member'
);

-- Carol is in no group.

-- Act as Bob: should see both members of Alice's group.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select is(
  (select count(*)::int from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'),
  2,
  'Bob (member) can see both members of his group'
);

-- Act as Carol: should see nothing.
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select is(
  (select count(*)::int from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'),
  0,
  'Carol (non-member) sees zero rows in that group'
);


-- ---------------------------------------------------------------------
-- Section 6 — RLS: INSERT denied for all authenticated callers
-- ---------------------------------------------------------------------
-- Even Alice (the admin) cannot directly insert another member.
-- That path goes through the accept-invite Edge Function.
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$insert into public.group_members (group_id, user_id, role)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade03-3333-3333-3333-333333333333',
            'member')$$,
  '42501',
  null,
  'authenticated user CANNOT directly INSERT into group_members'
);


-- ---------------------------------------------------------------------
-- Section 7 — RLS: UPDATE role restricted to admins
-- ---------------------------------------------------------------------
-- Bob (member, not admin) tries to promote himself to admin. RLS hides
-- the row from him for UPDATE purposes, so 0 rows change.
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

update public.group_members
  set role = 'admin'
  where group_id = '1ea61111-1111-1111-1111-111111111111'
    and user_id = 'decade02-2222-2222-2222-222222222222';

set local role postgres;

select is(
  (select role::text from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'
     and user_id = 'decade02-2222-2222-2222-222222222222'),
  'member',
  'non-admin CANNOT promote themselves to admin'
);

-- Alice (admin) promotes Bob → should succeed.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

update public.group_members
  set role = 'admin'
  where group_id = '1ea61111-1111-1111-1111-111111111111'
    and user_id = 'decade02-2222-2222-2222-222222222222';

set local role postgres;

select is(
  (select role::text from public.group_members
   where group_id = '1ea61111-1111-1111-1111-111111111111'
     and user_id = 'decade02-2222-2222-2222-222222222222'),
  'admin',
  'admin CAN promote a member to admin'
);


-- ---------------------------------------------------------------------
-- Section 8 — Last-admin protection
-- ---------------------------------------------------------------------
-- Create a second group where Alice is the SOLE admin.
insert into public.groups (id, name, created_by)
values (
  '1ea62222-2222-2222-2222-222222222222',
  'Solo Group',
  'decade01-1111-1111-1111-111111111111'
);

-- Alice tries to leave her own solo-admin group → trigger blocks it.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$delete from public.group_members
    where group_id = '1ea62222-2222-2222-2222-222222222222'
      and user_id = 'decade01-1111-1111-1111-111111111111'$$,
  '23514',  -- check_violation (raised by trigger)
  null,
  'last admin cannot leave the group'
);

-- Alice tries to demote herself from admin while solo → trigger blocks.
select throws_ok(
  $$update public.group_members
    set role = 'member'
    where group_id = '1ea62222-2222-2222-2222-222222222222'
      and user_id = 'decade01-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'last admin cannot demote themselves to member'
);


-- ---------------------------------------------------------------------
-- Section 9 — Last-admin OK when another admin exists
-- ---------------------------------------------------------------------
-- Back to Alice's first group, where Bob is now also admin (from §7).
-- Alice should be able to leave because Bob remains as admin.

set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.group_members
  where group_id = '1ea61111-1111-1111-1111-111111111111'
    and user_id = 'decade01-1111-1111-1111-111111111111';

set local role postgres;

select is_empty(
  $$select 1 from public.group_members
    where group_id = '1ea61111-1111-1111-1111-111111111111'
      and user_id = 'decade01-1111-1111-1111-111111111111'$$,
  'admin CAN leave when another admin exists'
);


-- ---------------------------------------------------------------------
-- Section 10 — Admin kick / non-admin cannot kick
-- ---------------------------------------------------------------------
-- Add Carol to Bob's group (now solely Bob's after Alice left).
insert into public.group_members (group_id, user_id, role)
values (
  '1ea61111-1111-1111-1111-111111111111',
  'decade03-3333-3333-3333-333333333333',
  'member'
);

-- Carol (member, not admin) tries to kick Bob. RLS denies → 0 rows.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

delete from public.group_members
  where group_id = '1ea61111-1111-1111-1111-111111111111'
    and user_id = 'decade02-2222-2222-2222-222222222222';

set local role postgres;

select isnt_empty(
  $$select 1 from public.group_members
    where group_id = '1ea61111-1111-1111-1111-111111111111'
      and user_id = 'decade02-2222-2222-2222-222222222222'$$,
  'non-admin CANNOT kick another member'
);

-- Bob (admin) kicks Carol → succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

delete from public.group_members
  where group_id = '1ea61111-1111-1111-1111-111111111111'
    and user_id = 'decade03-3333-3333-3333-333333333333';

set local role postgres;

select is_empty(
  $$select 1 from public.group_members
    where group_id = '1ea61111-1111-1111-1111-111111111111'
      and user_id = 'decade03-3333-3333-3333-333333333333'$$,
  'admin CAN kick a member'
);


-- ---------------------------------------------------------------------
-- Section 11 — Cascade: deleting a group removes all memberships
-- ---------------------------------------------------------------------
-- The last-admin trigger must NOT fire here, because the cascade
-- from DELETE on groups bypasses BEFORE DELETE triggers on children.
delete from public.groups
  where id = '1ea62222-2222-2222-2222-222222222222';

select is_empty(
  $$select 1 from public.group_members
    where group_id = '1ea62222-2222-2222-2222-222222222222'$$,
  'deleting a group cascades to remove its group_members rows'
);


select * from finish();
rollback;
