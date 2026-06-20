-- =====================================================================
-- idea_rsvps RLS test suite (Phase 13)
-- =====================================================================
-- Coverage: members SELECT/insert/update/delete their own RSVP; the
-- group_id must match the idea's group; non-members and impersonation
-- are rejected; anon sees nothing.
-- =====================================================================

begin;

select plan(10);

select has_table('public', 'idea_rsvps', 'idea_rsvps table exists');

-- ---------------------------------------------------------------------
-- Seed: Alice (admin of G), Bob (member of G), Carol (admin of H only)
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

insert into public.groups (id, name, created_by)
values ('9b00aa01-0000-0000-0000-000000000001', 'Group G',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
       ('9b00bb02-0000-0000-0000-000000000002', 'Group H',
        'decade0c-cccc-cccc-cccc-cccccccccccc');

insert into public.group_members (group_id, user_id, role)
values ('9b00aa01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea0a01-0000-0000-0000-000000000001', '9b00aa01-0000-0000-0000-000000000001',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Taco Night', 'food'),
       ('1dea0b02-0000-0000-0000-000000000002', '9b00bb02-0000-0000-0000-000000000002',
        'decade0c-cccc-cccc-cccc-cccccccccccc', 'Hidden', 'food');


-- ---------------------------------------------------------------------
-- Bob (member): RSVP lifecycle on Taco Night
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

select lives_ok(
  $$insert into public.idea_rsvps (idea_id, user_id, group_id, status)
    values ('1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '9b00aa01-0000-0000-0000-000000000001', 'going')$$,
  'member can RSVP going to an idea in their group'
);

update public.idea_rsvps
  set status = 'maybe'
  where idea_id = '1dea0a01-0000-0000-0000-000000000001'
    and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

set local role postgres;
select is(
  (select status::text from public.idea_rsvps
    where idea_id = '1dea0a01-0000-0000-0000-000000000001'
      and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'maybe',
  'member can update their own RSVP'
);

-- Alice (also a member) sees Bob's RSVP.
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
select isnt_empty(
  $$select 1 from public.idea_rsvps where idea_id = '1dea0a01-0000-0000-0000-000000000001'$$,
  'another member can see the RSVP'
);


-- ---------------------------------------------------------------------
-- Carol (non-member of G): cannot see or create
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0c-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.idea_rsvps where group_id = '9b00aa01-0000-0000-0000-000000000001'$$,
  'a non-member sees no RSVPs for the group'
);

select throws_ok(
  $$insert into public.idea_rsvps (idea_id, user_id, group_id, status)
    values ('1dea0a01-0000-0000-0000-000000000001', 'decade0c-cccc-cccc-cccc-cccccccccccc',
            '9b00aa01-0000-0000-0000-000000000001', 'going')$$,
  '42501', null,
  'a non-member cannot RSVP'
);


-- ---------------------------------------------------------------------
-- Bob: cannot impersonate, cannot cross-wire the group_id
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

select throws_ok(
  $$insert into public.idea_rsvps (idea_id, user_id, group_id, status)
    values ('1dea0a01-0000-0000-0000-000000000001', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '9b00aa01-0000-0000-0000-000000000001', 'going')$$,
  '42501', null,
  'cannot RSVP on behalf of another user'
);

select throws_ok(
  $$insert into public.idea_rsvps (idea_id, user_id, group_id, status)
    values ('1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            '9b00bb02-0000-0000-0000-000000000002', 'going')$$,
  '42501', null,
  'cannot RSVP with a group_id the idea does not belong to'
);


-- ---------------------------------------------------------------------
-- Bob: withdraw own RSVP
-- ---------------------------------------------------------------------
delete from public.idea_rsvps
  where idea_id = '1dea0a01-0000-0000-0000-000000000001'
    and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

set local role postgres;
select is_empty(
  $$select 1 from public.idea_rsvps where idea_id = '1dea0a01-0000-0000-0000-000000000001'$$,
  'member can withdraw their own RSVP'
);


-- ---------------------------------------------------------------------
-- anon: blocked
-- ---------------------------------------------------------------------
set local role anon;
select is_empty(
  $$select 1 from public.idea_rsvps$$,
  'anon sees no RSVPs'
);


select * from finish();
rollback;
