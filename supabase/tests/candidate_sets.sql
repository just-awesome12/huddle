-- =====================================================================
-- saved candidate sets test suite (Phase 15, slice 15e)
-- =====================================================================
-- Coverage: structure; member SELECT/INSERT; non-member isolation;
-- forged created_by rejected; the 2..50 ideas CHECK; author + admin
-- DELETE, and that a non-author non-admin member's delete is a no-op.
-- =====================================================================

begin;

select plan(11);

select has_table('public', 'candidate_sets', 'candidate_sets table exists');
select columns_are(
  'public', 'candidate_sets',
  array['id', 'group_id', 'created_by', 'name', 'idea_ids', 'created_at'],
  'candidate_sets has the expected columns'
);

-- ---------------------------------------------------------------------
-- Seed: Alice (creator → auto-admin), Bob (member), Carol (non-member)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000c5',
   'authenticated', 'authenticated', 'alice-cs@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000c5',
   'authenticated', 'authenticated', 'bob-cs@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000c5',
   'authenticated', 'authenticated', 'carol-cs@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('33330000-0000-0000-0000-000000000001', 'Set Group',
        'a0000000-0000-0000-0000-0000000000c5');
insert into public.group_members (group_id, user_id, role)
values ('33330000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000c5', 'member');

-- ---------------------------------------------------------------------
-- Alice (admin) saves a set
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000c5", "role": "authenticated"}';

insert into public.candidate_sets (id, group_id, created_by, name, idea_ids)
values ('44440000-0000-0000-0000-000000000001',
        '33330000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000c5', 'Friday dinner',
        array['dddd0000-0000-0000-0000-000000000001',
              'dddd0000-0000-0000-0000-000000000002']::uuid[]);
select pass('a member can save a candidate set');

-- The 2..50 ideas CHECK rejects a one-idea set.
select throws_ok(
  $$insert into public.candidate_sets (group_id, created_by, name, idea_ids)
    values ('33330000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-0000000000c5', 'too small',
            array['dddd0000-0000-0000-0000-000000000001']::uuid[])$$,
  '23514', null,
  'a set with fewer than 2 ideas is rejected by the CHECK'
);

-- ---------------------------------------------------------------------
-- Bob (member) can read the set
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000c5", "role": "authenticated"}';
select isnt_empty(
  $$select 1 from public.candidate_sets
    where group_id = '33330000-0000-0000-0000-000000000001'$$,
  'a member can read the group''s saved sets'
);

-- Bob cannot forge a set authored by Alice.
select throws_ok(
  $$insert into public.candidate_sets (group_id, created_by, name, idea_ids)
    values ('33330000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-0000000000c5', 'forged',
            array['dddd0000-0000-0000-0000-000000000001',
                  'dddd0000-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', null,
  'a member cannot forge another user''s created_by'
);

-- A non-author, non-admin member's delete is a no-op (RLS hides the row
-- from DELETE) — the set survives.
delete from public.candidate_sets where id = '44440000-0000-0000-0000-000000000001';
select isnt_empty(
  $$select 1 from public.candidate_sets where id = '44440000-0000-0000-0000-000000000001'$$,
  'a non-author non-admin member cannot delete someone else''s set'
);

-- ---------------------------------------------------------------------
-- Carol (non-member) is fully isolated
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "c0000000-0000-0000-0000-0000000000c5", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.candidate_sets
    where group_id = '33330000-0000-0000-0000-000000000001'$$,
  'a non-member cannot read the group''s sets'
);
select throws_ok(
  $$insert into public.candidate_sets (group_id, created_by, name, idea_ids)
    values ('33330000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-0000000000c5', 'intruder',
            array['dddd0000-0000-0000-0000-000000000001',
                  'dddd0000-0000-0000-0000-000000000002']::uuid[])$$,
  '42501', null,
  'a non-member cannot save a set in the group'
);

-- ---------------------------------------------------------------------
-- Author + admin DELETE
-- ---------------------------------------------------------------------
-- Bob saves his own set...
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000c5", "role": "authenticated"}';
insert into public.candidate_sets (id, group_id, created_by, name, idea_ids)
values ('44440000-0000-0000-0000-000000000002',
        '33330000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-0000000000c5', 'Bob''s set',
        array['dddd0000-0000-0000-0000-000000000003',
              'dddd0000-0000-0000-0000-000000000004']::uuid[]);

-- ...and Alice (admin) can delete it (moderation).
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000c5", "role": "authenticated"}';
delete from public.candidate_sets where id = '44440000-0000-0000-0000-000000000002';
select is_empty(
  $$select 1 from public.candidate_sets where id = '44440000-0000-0000-0000-000000000002'$$,
  'a group admin can delete any set (moderation)'
);

-- Alice deletes her own set too.
delete from public.candidate_sets where id = '44440000-0000-0000-0000-000000000001';
select is_empty(
  $$select 1 from public.candidate_sets where id = '44440000-0000-0000-0000-000000000001'$$,
  'the author can delete their own set'
);

select * from finish();
rollback;
