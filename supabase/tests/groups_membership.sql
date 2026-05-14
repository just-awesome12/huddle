-- =====================================================================
-- groups widened-RLS test suite (Phase 1.3)
-- =====================================================================
-- Phase 1.2 tested "creator can see, others cannot." Phase 1.3 widened
-- the policies. This file proves the new posture works:
--   - Members (not just the creator) can SELECT
--   - Admins (not just the creator) can UPDATE / DELETE
--   - Non-members still see nothing (regression of Phase 1.2)
-- =====================================================================

begin;

select plan(8);


-- ---------------------------------------------------------------------
-- Seed: Alice creates the group; Bob is added as member; Carol is in
-- no group.
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

insert into public.group_members (group_id, user_id, role)
values ('1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222',
        'member');


-- ---------------------------------------------------------------------
-- Section 1 — SELECT widened to members
-- ---------------------------------------------------------------------
-- Alice (creator + admin) sees her group.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'admin/creator can see their group'
);

-- Bob (member, not creator) sees the group too. This is the new
-- behaviour from Phase 1.3 — in 1.2 he would not have seen it.
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'non-admin member can NOW see the group (widened from Phase 1.2)'
);

-- Carol (non-member) still sees nothing — regression check.
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'non-member still cannot see the group (Phase 1.2 isolation preserved)'
);


-- ---------------------------------------------------------------------
-- Section 2 — UPDATE: admin yes, member no
-- ---------------------------------------------------------------------
-- Bob (member, not admin) tries to rename → RLS hides the row.
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

update public.groups
  set name = 'Bob''s Takeover'
  where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;

select is(
  (select name from public.groups where id = '1ea61111-1111-1111-1111-111111111111'),
  'Alice''s Crew',
  'non-admin member CANNOT rename the group'
);

-- Alice (admin) renames → succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

update public.groups
  set name = 'Alice''s Crew v2'
  where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;

select is(
  (select name from public.groups where id = '1ea61111-1111-1111-1111-111111111111'),
  'Alice''s Crew v2',
  'admin CAN rename the group'
);


-- ---------------------------------------------------------------------
-- Section 3 — DELETE: admin yes, member no, non-member no
-- ---------------------------------------------------------------------
-- Bob tries to delete → blocked.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

delete from public.groups where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;

select isnt_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'non-admin member CANNOT delete the group'
);

-- Carol tries to delete → blocked.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

delete from public.groups where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;

select isnt_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'non-member CANNOT delete the group'
);

-- Alice deletes → succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.groups where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;

select is_empty(
  $$select 1 from public.groups where id = '1ea61111-1111-1111-1111-111111111111'$$,
  'admin CAN delete the group'
);


select * from finish();
rollback;
