-- =====================================================================
-- groups test suite (Phase 1.2)
-- =====================================================================
-- Coverage:
--   - Table structure
--   - Name CHECK constraint (positive + negative)
--   - Name trim trigger
--   - updated_at maintenance
--   - RLS: anon cannot read
--   - RLS: authenticated INSERT requires created_by = auth.uid()
--   - RLS: creator can read their own group
--   - RLS: a different authenticated user CANNOT read another user's group
--   - RLS: only the creator can update / delete
-- =====================================================================

begin;

select plan(17);

-- ---------------------------------------------------------------------
-- Section 1 — Structure
-- ---------------------------------------------------------------------
select has_table('public', 'groups', 'groups table exists');

select columns_are(
  'public', 'groups',
  array['id', 'name', 'created_by', 'created_at', 'updated_at',
        'visibility', 'description', 'location', 'tags', 'member_count'],
  'groups has the expected columns'
);

select col_is_pk('public', 'groups', 'id', 'id is the primary key');


-- ---------------------------------------------------------------------
-- Section 2 — Seed users (as superuser, bypassing RLS)
-- ---------------------------------------------------------------------
set local role postgres;

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
), (
  '00000000-0000-0000-0000-000000000000',
  'decade02-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'bob@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb,
  now(), now()
);


-- ---------------------------------------------------------------------
-- Section 3 — Name constraint and trim trigger
-- ---------------------------------------------------------------------
-- Still as superuser to isolate testing of the constraint from RLS.

select throws_ok(
  $$insert into public.groups (name, created_by)
    values ('', 'decade01-1111-1111-1111-111111111111')$$,
  '23514',  -- check_violation
  null,
  'empty group name is rejected'
);

select throws_ok(
  $$insert into public.groups (name, created_by)
    values ('   ', 'decade01-1111-1111-1111-111111111111')$$,
  '23514',
  null,
  'whitespace-only group name is rejected (CHECK applies after trim)'
);

-- Trim trigger: "  Game Night  " should become "Game Night"
insert into public.groups (id, name, created_by)
values (
  'decade03-3333-3333-3333-333333333333',
  '  Game Night  ',
  'decade01-1111-1111-1111-111111111111'
);

select is(
  (select name from public.groups where id = 'decade03-3333-3333-3333-333333333333'),
  'Game Night',
  'group name is trimmed on insert'
);


-- ---------------------------------------------------------------------
-- Section 4 — RLS: anonymous role
-- ---------------------------------------------------------------------
set local role anon;

select is_empty(
  $$select 1 from public.groups$$,
  'anon role cannot read any groups'
);


-- ---------------------------------------------------------------------
-- Section 5 — RLS: INSERT requires created_by = auth.uid()
-- ---------------------------------------------------------------------
-- Act as Bob.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

-- Bob tries to insert a group with himself as creator → allowed.
insert into public.groups (id, name, created_by)
values (
  '44444444-4444-4444-4444-444444444444',
  'Bob''s Crew',
  'decade02-2222-2222-2222-222222222222'
);

select pass('authenticated user can create a group with themselves as creator');

-- Bob tries to forge a group with Alice as creator → denied by WITH CHECK.
select throws_ok(
  $$insert into public.groups (name, created_by)
    values ('Forged', 'decade01-1111-1111-1111-111111111111')$$,
  '42501',  -- insufficient_privilege (RLS WITH CHECK violation)
  null,
  'authenticated user CANNOT insert a group with another user as creator'
);


-- ---------------------------------------------------------------------
-- Section 6 — RLS: SELECT visibility
-- ---------------------------------------------------------------------
-- Still acting as Bob. He should see his own group but not Alice's.

select isnt_empty(
  $$select 1 from public.groups where id = '44444444-4444-4444-4444-444444444444'$$,
  'Bob can see his own group'
);

select is_empty(
  $$select 1 from public.groups where id = 'decade03-3333-3333-3333-333333333333'$$,
  'Bob CANNOT see Alice''s group'
);

-- Switch to Alice and re-check.
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.groups where id = 'decade03-3333-3333-3333-333333333333'$$,
  'Alice can see her own group'
);

select is_empty(
  $$select 1 from public.groups where id = '44444444-4444-4444-4444-444444444444'$$,
  'Alice CANNOT see Bob''s group'
);


-- ---------------------------------------------------------------------
-- Section 7 — RLS: UPDATE / DELETE restricted to creator
-- ---------------------------------------------------------------------
-- Alice tries to rename Bob's group. RLS hides the row, so UPDATE
-- affects 0 rows and the name remains unchanged.
update public.groups
  set name = 'Hijacked by Alice'
  where id = '44444444-4444-4444-4444-444444444444';

-- Drop down to superuser to verify Bob's group is unchanged.
set local role postgres;

select is(
  (select name from public.groups where id = '44444444-4444-4444-4444-444444444444'),
  'Bob''s Crew',
  'a non-creator CANNOT update another user''s group (RLS hides the row)'
);

-- Same test for DELETE.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.groups where id = '44444444-4444-4444-4444-444444444444';

set local role postgres;

select isnt_empty(
  $$select 1 from public.groups where id = '44444444-4444-4444-4444-444444444444'$$,
  'a non-creator CANNOT delete another user''s group'
);


-- ---------------------------------------------------------------------
-- Section 8 — updated_at maintenance
-- ---------------------------------------------------------------------
-- Capture before, update, compare. Uses clock_timestamp() in the
-- trigger so the value advances within this transaction.
do $$
declare
  before_ts timestamptz;
  after_ts timestamptz;
begin
  select updated_at into before_ts
    from public.groups
    where id = 'decade03-3333-3333-3333-333333333333';

  perform pg_sleep(0.01);

  update public.groups
    set name = 'Game Night Reloaded'
    where id = 'decade03-3333-3333-3333-333333333333';

  select updated_at into after_ts
    from public.groups
    where id = 'decade03-3333-3333-3333-333333333333';

  if after_ts <= before_ts then
    raise exception 'groups.updated_at did not advance on UPDATE (before=%, after=%)',
      before_ts, after_ts;
  end if;
end $$;

select pass('groups.updated_at advances on UPDATE');


-- ---------------------------------------------------------------------
-- Section 9 — Cascade on profile delete
-- ---------------------------------------------------------------------
-- Verify that deleting a user (via auth.users) cascades through
-- profiles and through groups.created_by. Use Alice and her group.
delete from auth.users where id = 'decade01-1111-1111-1111-111111111111';

select is_empty(
  $$select 1 from public.groups where created_by = 'decade01-1111-1111-1111-111111111111'$$,
  'deleting an auth.user cascades through profile to delete their groups'
);


select * from finish();
rollback;
