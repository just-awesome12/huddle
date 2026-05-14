-- =====================================================================
-- group_invites test suite (Phase 1.3)
-- =====================================================================
-- Coverage:
--   - Structure
--   - Token format (default generator, CHECK constraint)
--   - Default expiry is ~7 days out
--   - reject_invite_if_member trigger
--   - Token uniqueness
--   - RLS: anon cannot read
--   - RLS: SELECT visible to admin of the group
--   - RLS: SELECT visible to the invited user
--   - RLS: SELECT hidden from unrelated users
--   - RLS: INSERT requires admin role
--   - RLS: INSERT requires created_by = auth.uid()
--   - RLS: DELETE only by admin
--   - RLS: accepted_consistency CHECK constraint
-- =====================================================================

begin;

select plan(15);


-- ---------------------------------------------------------------------
-- Section 1 — Structure
-- ---------------------------------------------------------------------
select has_table('public', 'group_invites', 'group_invites table exists');

select columns_are(
  'public', 'group_invites',
  array['id', 'group_id', 'token', 'invited_email', 'invited_user_id',
        'created_by', 'expires_at', 'accepted_by', 'accepted_at',
        'created_at'],
  'group_invites has the expected columns'
);


-- ---------------------------------------------------------------------
-- Section 2 — Seed
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

insert into public.groups (id, name, created_by)
values ('1ea61111-1111-1111-1111-111111111111', 'Alice''s Crew',
        'decade01-1111-1111-1111-111111111111');


-- ---------------------------------------------------------------------
-- Section 3 — Token format / generator
-- ---------------------------------------------------------------------
-- Insert as Alice (the admin of the group) to exercise the real
-- INSERT path. Use the default token generator (no explicit token).
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.group_invites (id, group_id, created_by, invited_user_id)
values (
  '1ff11111-1111-1111-1111-111111111111',
  '1ea61111-1111-1111-1111-111111111111',
  'decade01-1111-1111-1111-111111111111',
  'decade02-2222-2222-2222-222222222222'  -- inviting Bob
);

set local role postgres;

select matches(
  (select token from public.group_invites where id = '1ff11111-1111-1111-1111-111111111111'),
  '^[A-Za-z0-9_-]{40,64}$',
  'generated token matches base64url format'
);


-- ---------------------------------------------------------------------
-- Section 4 — Default expiry is ~7 days out
-- ---------------------------------------------------------------------
select cmp_ok(
  (select expires_at from public.group_invites where id = '1ff11111-1111-1111-1111-111111111111'),
  '>',
  now() + interval '6 days',
  'default expiry is at least 6 days in the future'
);


-- ---------------------------------------------------------------------
-- Section 5 — reject_invite_if_member trigger
-- ---------------------------------------------------------------------
-- Bob is invited but not yet a member. Add him directly (superuser
-- path; in real life he'd accept the invite). Then re-invite him —
-- should be rejected.
insert into public.group_members (group_id, user_id, role)
values (
  '1ea61111-1111-1111-1111-111111111111',
  'decade02-2222-2222-2222-222222222222',
  'member'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$insert into public.group_invites (group_id, created_by, invited_user_id)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade01-1111-1111-1111-111111111111',
            'decade02-2222-2222-2222-222222222222')$$,
  '23505',  -- unique_violation (raised by trigger)
  null,
  'cannot invite a user who is already a member'
);


-- ---------------------------------------------------------------------
-- Section 6 — Token uniqueness (default generator should not collide)
-- ---------------------------------------------------------------------
-- Insert a second invite (Carol this time, who isn't a member).
insert into public.group_invites (id, group_id, created_by, invited_user_id)
values (
  '1ff22222-2222-2222-2222-222222222222',
  '1ea61111-1111-1111-1111-111111111111',
  'decade01-1111-1111-1111-111111111111',
  'decade03-3333-3333-3333-333333333333'
);

set local role postgres;

select isnt(
  (select token from public.group_invites where id = '1ff11111-1111-1111-1111-111111111111'),
  (select token from public.group_invites where id = '1ff22222-2222-2222-2222-222222222222'),
  'two generated tokens are distinct'
);


-- ---------------------------------------------------------------------
-- Section 7 — RLS: anon
-- ---------------------------------------------------------------------
set local role anon;

select is_empty(
  $$select 1 from public.group_invites$$,
  'anon role cannot read group_invites'
);


-- ---------------------------------------------------------------------
-- Section 8 — RLS: admin sees invites for their group
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select is(
  (select count(*)::int from public.group_invites
   where group_id = '1ea61111-1111-1111-1111-111111111111'),
  2,
  'admin sees all invites for their group'
);


-- ---------------------------------------------------------------------
-- Section 9 — RLS: invited user sees their own invite
-- ---------------------------------------------------------------------
-- Carol can see the invite addressed to her.
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.group_invites
    where invited_user_id = 'decade03-3333-3333-3333-333333333333'$$,
  'invited user can see their own invite'
);


-- ---------------------------------------------------------------------
-- Section 10 — RLS: unrelated users see nothing
-- ---------------------------------------------------------------------
-- Carol is invited but not yet a member. She should see HER invite
-- (above) but NOT Bob's invite (which is for a different user).
select is_empty(
  $$select 1 from public.group_invites
    where invited_user_id = 'decade02-2222-2222-2222-222222222222'$$,
  'a user does not see invites addressed to others'
);


-- ---------------------------------------------------------------------
-- Section 11 — RLS: INSERT requires admin
-- ---------------------------------------------------------------------
-- Bob is a member but not an admin. He should not be able to invite.
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$insert into public.group_invites (group_id, created_by)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade02-2222-2222-2222-222222222222')$$,
  '42501',
  null,
  'non-admin member CANNOT create an invite'
);


-- ---------------------------------------------------------------------
-- Section 12 — RLS: INSERT requires created_by = auth.uid()
-- ---------------------------------------------------------------------
-- Alice tries to forge an invite with Bob as the creator → blocked.
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$insert into public.group_invites (group_id, created_by)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade02-2222-2222-2222-222222222222')$$,
  '42501',
  null,
  'created_by must equal auth.uid()'
);


-- ---------------------------------------------------------------------
-- Section 13 — RLS: DELETE only by admin
-- ---------------------------------------------------------------------
-- Carol (non-admin) tries to delete her own pending invite → blocked.
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

delete from public.group_invites where id = '1ff22222-2222-2222-2222-222222222222';

set local role postgres;

select isnt_empty(
  $$select 1 from public.group_invites where id = '1ff22222-2222-2222-2222-222222222222'$$,
  'invited user CANNOT delete their pending invite'
);

-- Alice (admin) deletes (revokes) it → succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.group_invites where id = '1ff22222-2222-2222-2222-222222222222';

set local role postgres;

select is_empty(
  $$select 1 from public.group_invites where id = '1ff22222-2222-2222-2222-222222222222'$$,
  'admin CAN revoke (delete) an invite'
);


-- ---------------------------------------------------------------------
-- Section 14 — accepted_consistency CHECK constraint
-- ---------------------------------------------------------------------
-- Half-set accepted state should be rejected. (We test by trying to
-- set only accepted_by; accepted_at remains null.)
select throws_ok(
  $$update public.group_invites
    set accepted_by = 'decade02-2222-2222-2222-222222222222'
    where id = '1ff11111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'setting accepted_by without accepted_at violates CHECK'
);


select * from finish();
rollback;
