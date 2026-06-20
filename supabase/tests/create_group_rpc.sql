-- =====================================================================
-- create_group RPC test suite (Phase 3.2)
-- =====================================================================
-- Coverage:
--   - Function exists with the expected signature
--   - Authenticated caller: creates group, returns the row, caller is
--     admin member, caller can SELECT the group afterwards
--   - Name validation (CHECK constraint) still applies through the RPC
--   - Anon role cannot execute
-- =====================================================================

begin;

select plan(7);

select has_function(
  'public', 'create_group',
  array['text', 'text', 'text', 'text[]', 'group_visibility'],
  'create_group(name, description, location, tags, visibility) exists'
);

-- ---------------------------------------------------------------------
-- Seed a user (as superuser)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'decade09-9999-9999-9999-999999999999',
  'authenticated', 'authenticated',
  'rpc_tester@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb,
  now(), now()
);

-- ---------------------------------------------------------------------
-- Authenticated: create a group through the RPC
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade09-9999-9999-9999-999999999999", "role": "authenticated"}';

select is(
  (select name from public.create_group('  RPC Group  ')),
  'RPC Group',
  'create_group returns the new row with the name trimmed'
);

select isnt_empty(
  $$select 1 from public.groups where name = 'RPC Group'$$,
  'creator can SELECT the group after create_group (membership exists)'
);

select is(
  (select role::text from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where g.name = 'RPC Group'
      and gm.user_id = 'decade09-9999-9999-9999-999999999999'),
  'admin',
  'creator is an admin member of the new group'
);

-- ---------------------------------------------------------------------
-- Validation still applies through the RPC
-- ---------------------------------------------------------------------
select throws_ok(
  $$select public.create_group('   ')$$,
  '23514',
  null,
  'whitespace-only name is rejected through the RPC'
);

select throws_ok(
  $$select public.create_group(repeat('x', 81))$$,
  '23514',
  null,
  'an 81-character name is rejected through the RPC'
);

-- ---------------------------------------------------------------------
-- Anon cannot execute
-- ---------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$select public.create_group('Anon Group')$$,
  '42501',
  null,
  'anon role cannot execute create_group'
);

select * from finish();
rollback;
