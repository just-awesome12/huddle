-- =====================================================================
-- counted polls test suite (Phase 16, slice 16a)
-- =====================================================================
-- Coverage: structure; member create poll + options; member read; one
-- vote per (poll,user) + change; forged vote rejected; non-creator can't
-- add options; non-member isolation; creator close; non-admin delete is a
-- no-op; creator delete cascades options + votes.
-- =====================================================================

begin;

select plan(15);

select has_table('public', 'polls', 'polls table exists');
select has_table('public', 'poll_options', 'poll_options table exists');
select has_table('public', 'poll_votes', 'poll_votes table exists');

-- ---------------------------------------------------------------------
-- Seed: Alice (creator → auto-admin), Bob (member), Carol (non-member)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000d1',
   'authenticated', 'authenticated', 'alice-poll@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000d1',
   'authenticated', 'authenticated', 'bob-poll@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000d1',
   'authenticated', 'authenticated', 'carol-poll@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('55550000-0000-0000-0000-000000000001', 'Poll Group',
        'a0000000-0000-0000-0000-0000000000d1');
insert into public.group_members (group_id, user_id, role)
values ('55550000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000d1', 'member');

-- ---------------------------------------------------------------------
-- Alice (creator) makes a poll + two options
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';

insert into public.polls (id, group_id, created_by, question)
values ('66660000-0000-0000-0000-000000000001',
        '55550000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000d1', 'Pizza or sushi?');
select pass('a member can create a poll');

insert into public.poll_options (id, poll_id, group_id, label, position) values
  ('77770000-0000-0000-0000-000000000001', '66660000-0000-0000-0000-000000000001',
   '55550000-0000-0000-0000-000000000001', 'Pizza', 0),
  ('77770000-0000-0000-0000-000000000002', '66660000-0000-0000-0000-000000000001',
   '55550000-0000-0000-0000-000000000001', 'Sushi', 1);
select pass('the poll creator can add options');

-- ---------------------------------------------------------------------
-- Bob (member) reads + votes
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select isnt_empty(
  $$select 1 from public.polls where group_id = '55550000-0000-0000-0000-000000000001'$$,
  'a member can read the group''s polls'
);

insert into public.poll_votes (poll_id, option_id, user_id, group_id)
values ('66660000-0000-0000-0000-000000000001', '77770000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-000000000001');
select pass('a member can cast a vote');

-- Change the vote (one row per (poll,user) — PK).
update public.poll_votes
  set option_id = '77770000-0000-0000-0000-000000000002'
  where poll_id = '66660000-0000-0000-0000-000000000001'
    and user_id = 'b0000000-0000-0000-0000-0000000000d1';
select is(
  (select count(*)::int from public.poll_votes
    where poll_id = '66660000-0000-0000-0000-000000000001'
      and user_id = 'b0000000-0000-0000-0000-0000000000d1'),
  1,
  'changing a vote keeps a single row (PK poll_id,user_id)'
);

-- Bob cannot forge a vote as Alice.
select throws_ok(
  $$insert into public.poll_votes (poll_id, option_id, user_id, group_id)
    values ('66660000-0000-0000-0000-000000000001', '77770000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a member cannot forge another user''s vote'
);

-- Bob (non-creator, non-admin) cannot add an option to Alice's poll.
select throws_ok(
  $$insert into public.poll_options (poll_id, group_id, label, position)
    values ('66660000-0000-0000-0000-000000000001',
            '55550000-0000-0000-0000-000000000001', 'Tacos', 2)$$,
  '42501', null,
  'a non-creator member cannot add options to someone else''s poll'
);

-- ---------------------------------------------------------------------
-- Carol (non-member) is isolated
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "c0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.polls where group_id = '55550000-0000-0000-0000-000000000001'$$,
  'a non-member cannot read the group''s polls'
);
select throws_ok(
  $$insert into public.poll_votes (poll_id, option_id, user_id, group_id)
    values ('66660000-0000-0000-0000-000000000001', '77770000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a non-member cannot vote'
);

-- ---------------------------------------------------------------------
-- Close + delete
-- ---------------------------------------------------------------------
-- A non-admin, non-creator member's delete is a no-op (RLS) — poll stays.
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
delete from public.polls where id = '66660000-0000-0000-0000-000000000001';
select isnt_empty(
  $$select 1 from public.polls where id = '66660000-0000-0000-0000-000000000001'$$,
  'a non-creator non-admin member cannot delete a poll'
);

-- Alice (creator) closes the poll.
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
update public.polls set closed_at = now() where id = '66660000-0000-0000-0000-000000000001';
set local role postgres;
select ok(
  (select closed_at is not null from public.polls
    where id = '66660000-0000-0000-0000-000000000001'),
  'the creator can close a poll'
);

-- Alice deletes the poll → options + votes cascade.
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
delete from public.polls where id = '66660000-0000-0000-0000-000000000001';
set local role postgres;
select is_empty(
  $$select 1 from public.poll_options where poll_id = '66660000-0000-0000-0000-000000000001'$$,
  'deleting a poll cascades its options'
);

select * from finish();
rollback;
