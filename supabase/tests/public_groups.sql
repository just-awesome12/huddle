-- =====================================================================
-- public groups + join requests test suite (Phase 12)
-- =====================================================================
-- Proves the scoped softening of the members-only invariant:
--   - A public group's ROW is visible to non-members; an invite_only
--     group's row is not (regression of the members-only posture).
--   - A public group's CONTENTS (ideas, members) stay members-only.
--   - member_count is trigger-maintained on join/leave.
--   - request_to_join / respond_to_join_request behave + enforce admin.
--   - tag normalization + limits hold at the DB.
-- =====================================================================

begin;

select plan(26);

select has_function('public', 'create_group', 'create_group exists');
select has_function('public', 'request_to_join', 'request_to_join exists');
select has_function('public', 'respond_to_join_request', 'respond_to_join_request exists');


-- ---------------------------------------------------------------------
-- Seed: Alice (admin/creator), Bob + Carol (non-members)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'bob@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade0c-cccc-cccc-cccc-cccccccccccc',
   'authenticated', 'authenticated', 'carol@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Public group G (creator trigger makes Alice an admin member → count 1).
insert into public.groups (id, name, created_by, visibility)
values ('9b000001-0000-0000-0000-000000000001', 'Taco Lovers',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'public');

-- Invite-only group H.
insert into public.groups (id, name, created_by)
values ('9b000002-0000-0000-0000-000000000002', 'Secret Club',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- An idea in G (to prove contents stay members-only).
insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea0001-0000-0000-0000-000000000001',
        '9b000001-0000-0000-0000-000000000001',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'El Centro', 'food');


-- ---------------------------------------------------------------------
-- Visibility: Bob (non-member) sees the public row, not the private one
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "bob@example.com"}';

select isnt_empty(
  $$select 1 from public.groups where id = '9b000001-0000-0000-0000-000000000001'$$,
  'non-member CAN see a public group row'
);

select is_empty(
  $$select 1 from public.groups where id = '9b000002-0000-0000-0000-000000000002'$$,
  'non-member CANNOT see an invite_only group row'
);

select is_empty(
  $$select 1 from public.ideas where group_id = '9b000001-0000-0000-0000-000000000001'$$,
  'non-member CANNOT see a public group''s ideas (contents stay members-only)'
);

select is_empty(
  $$select 1 from public.group_members where group_id = '9b000001-0000-0000-0000-000000000001'$$,
  'non-member CANNOT see a public group''s member list'
);


-- ---------------------------------------------------------------------
-- member_count
-- ---------------------------------------------------------------------
set local role postgres;

select is(
  (select member_count from public.groups where id = '9b000001-0000-0000-0000-000000000001'),
  1,
  'member_count is 1 after creation (the admin)'
);


-- ---------------------------------------------------------------------
-- request_to_join
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "bob@example.com"}';

select is(
  (select status::text from public.request_to_join('9b000001-0000-0000-0000-000000000001')),
  'pending',
  'request_to_join on a public group creates a pending request'
);

select throws_ok(
  $$select public.request_to_join('9b000002-0000-0000-0000-000000000002')$$,
  'HD005', null,
  'request_to_join on an invite_only group raises HD005'
);

select throws_ok(
  $$select public.request_to_join('9b000001-0000-0000-0000-000000000001')$$,
  'HD006', null,
  're-requesting while pending raises HD006'
);

-- Bob (non-admin) cannot respond to his own request.
select throws_ok(
  $$select public.respond_to_join_request(
      (select id from public.group_join_requests
        where group_id = '9b000001-0000-0000-0000-000000000001'
          and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      true)$$,
  '42501', null,
  'a non-admin cannot respond to a join request'
);


-- ---------------------------------------------------------------------
-- Alice (admin) approves Bob
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated", "email": "alice@example.com"}';

select is(
  (select status::text from public.respond_to_join_request(
     (select id from public.group_join_requests
       where group_id = '9b000001-0000-0000-0000-000000000001'
         and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
         and status = 'pending'),
     true)),
  'approved',
  'admin approval marks the request approved'
);

set local role postgres;

select isnt_empty(
  $$select 1 from public.group_members
     where group_id = '9b000001-0000-0000-0000-000000000001'
       and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'approval adds the requester as a member'
);

select is(
  (select member_count from public.groups where id = '9b000001-0000-0000-0000-000000000001'),
  2,
  'member_count increments to 2 after approval'
);


-- ---------------------------------------------------------------------
-- Bob is now a member: sees contents, can't re-request
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "bob@example.com"}';

select isnt_empty(
  $$select 1 from public.ideas where group_id = '9b000001-0000-0000-0000-000000000001'$$,
  'a member CAN see the group''s ideas'
);

select throws_ok(
  $$select public.request_to_join('9b000001-0000-0000-0000-000000000001')$$,
  'HD004', null,
  'requesting to join when already a member raises HD004'
);

-- Alice responds again to the already-handled request.
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated", "email": "alice@example.com"}';

select throws_ok(
  $$select public.respond_to_join_request(
      (select id from public.group_join_requests
        where group_id = '9b000001-0000-0000-0000-000000000001'
          and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      true)$$,
  'HD002', null,
  'responding to an already-handled request raises HD002'
);


-- ---------------------------------------------------------------------
-- Reject path: Carol requests, Alice rejects
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0c-cccc-cccc-cccc-cccccccccccc", "role": "authenticated", "email": "carol@example.com"}';

select is(
  (select status::text from public.request_to_join('9b000001-0000-0000-0000-000000000001')),
  'pending',
  'Carol can file a pending request'
);

set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated", "email": "alice@example.com"}';

select is(
  (select status::text from public.respond_to_join_request(
     (select id from public.group_join_requests
       where group_id = '9b000001-0000-0000-0000-000000000001'
         and user_id = 'decade0c-cccc-cccc-cccc-cccccccccccc'
         and status = 'pending'),
     false)),
  'rejected',
  'admin rejection marks the request rejected'
);

set local role postgres;

select is_empty(
  $$select 1 from public.group_members
     where group_id = '9b000001-0000-0000-0000-000000000001'
       and user_id = 'decade0c-cccc-cccc-cccc-cccccccccccc'$$,
  'a rejected requester is NOT added as a member'
);


-- ---------------------------------------------------------------------
-- member_count decrements when a member leaves
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "bob@example.com"}';

delete from public.group_members
  where group_id = '9b000001-0000-0000-0000-000000000001'
    and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

set local role postgres;

select is(
  (select member_count from public.groups where id = '9b000001-0000-0000-0000-000000000001'),
  1,
  'member_count decrements to 1 after a member leaves'
);


-- ---------------------------------------------------------------------
-- anon cannot request to join
-- ---------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$select public.request_to_join('9b000001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'anon cannot execute request_to_join'
);


-- ---------------------------------------------------------------------
-- Tag normalization + limits (DB backstop)
-- ---------------------------------------------------------------------
set local role postgres;

insert into public.groups (id, name, created_by, tags)
values ('9b000003-0000-0000-0000-000000000003', 'Tagged', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        array['  Foo ', 'foo', 'BAR']);

select is(
  (select tags from public.groups where id = '9b000003-0000-0000-0000-000000000003'),
  array['foo', 'bar'],
  'tags are lowercased, trimmed, and de-duplicated'
);

select throws_ok(
  $$insert into public.groups (name, created_by, tags)
    values ('Too Many', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            array['a','b','c','d','e','f','g','h','i'])$$,
  '23514', null,
  'more than 8 tags is rejected'
);

select throws_ok(
  $$insert into public.groups (name, created_by, tags)
    values ('Long Tag', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            array[repeat('x', 31)])$$,
  '23514', null,
  'a tag longer than 30 characters is rejected'
);


select * from finish();
rollback;
