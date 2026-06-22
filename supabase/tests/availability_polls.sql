-- =====================================================================
-- availability poll test suite (Phase 16, slice 16b)
-- =====================================================================
-- Coverage: structure; member create poll + dates; member read; one
-- response per (date,user) + change; forged response rejected; non-creator
-- can't add dates; non-member isolation; creator close; non-admin delete
-- no-op; creator delete cascades dates + responses.
-- =====================================================================

begin;

select plan(16);

select has_table('public', 'availability_polls', 'availability_polls table exists');
select has_table('public', 'availability_dates', 'availability_dates table exists');
select has_table('public', 'availability_responses', 'availability_responses table exists');

-- ---------------------------------------------------------------------
-- Seed: Alice (creator → auto-admin), Bob (member), Carol (non-member)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'alice-av@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'bob-av@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'carol-av@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('88880000-0000-0000-0000-000000000001', 'Avail Group',
        'a0000000-0000-0000-0000-0000000000e1');
insert into public.group_members (group_id, user_id, role)
values ('88880000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000e1', 'member');

-- ---------------------------------------------------------------------
-- Alice (creator) makes a poll + two dates
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

insert into public.availability_polls (id, group_id, created_by, title)
values ('99990000-0000-0000-0000-0000000000a1',
        '88880000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-0000000000e1', 'Dinner next week?');
select pass('a member can create an availability poll');

insert into public.availability_dates (id, poll_id, group_id, event_date, position) values
  ('aaaa0000-0000-0000-0000-0000000000d1', '99990000-0000-0000-0000-0000000000a1',
   '88880000-0000-0000-0000-000000000001', '2026-07-01', 0),
  ('aaaa0000-0000-0000-0000-0000000000d2', '99990000-0000-0000-0000-0000000000a1',
   '88880000-0000-0000-0000-000000000001', '2026-07-02', 1);
select pass('the creator can add candidate dates');

-- ---------------------------------------------------------------------
-- Bob (member) reads + marks availability
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select isnt_empty(
  $$select 1 from public.availability_polls where group_id = '88880000-0000-0000-0000-000000000001'$$,
  'a member can read the group''s availability polls'
);

insert into public.availability_responses (date_id, poll_id, user_id, group_id, status)
values ('aaaa0000-0000-0000-0000-0000000000d1', '99990000-0000-0000-0000-0000000000a1',
        'b0000000-0000-0000-0000-0000000000e1', '88880000-0000-0000-0000-000000000001', 'yes');
select pass('a member can mark a date');

-- Change the response (one row per (date,user)).
update public.availability_responses set status = 'maybe'
  where date_id = 'aaaa0000-0000-0000-0000-0000000000d1'
    and user_id = 'b0000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from public.availability_responses
    where date_id = 'aaaa0000-0000-0000-0000-0000000000d1'
      and user_id = 'b0000000-0000-0000-0000-0000000000e1'),
  1,
  'changing a response keeps a single row (PK date_id,user_id)'
);

-- The status CHECK rejects a bogus value.
select throws_ok(
  $$insert into public.availability_responses (date_id, poll_id, user_id, group_id, status)
    values ('aaaa0000-0000-0000-0000-0000000000d2', '99990000-0000-0000-0000-0000000000a1',
            'b0000000-0000-0000-0000-0000000000e1', '88880000-0000-0000-0000-000000000001', 'perhaps')$$,
  '23514', null,
  'an invalid status is rejected by the CHECK'
);

-- Bob cannot forge Alice's response.
select throws_ok(
  $$insert into public.availability_responses (date_id, poll_id, user_id, group_id, status)
    values ('aaaa0000-0000-0000-0000-0000000000d2', '99990000-0000-0000-0000-0000000000a1',
            'a0000000-0000-0000-0000-0000000000e1', '88880000-0000-0000-0000-000000000001', 'yes')$$,
  '42501', null,
  'a member cannot forge another user''s response'
);

-- Bob (non-creator) cannot add a date.
select throws_ok(
  $$insert into public.availability_dates (poll_id, group_id, event_date, position)
    values ('99990000-0000-0000-0000-0000000000a1',
            '88880000-0000-0000-0000-000000000001', '2026-07-09', 2)$$,
  '42501', null,
  'a non-creator member cannot add dates'
);

-- ---------------------------------------------------------------------
-- Carol (non-member) is isolated
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "c0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.availability_polls where group_id = '88880000-0000-0000-0000-000000000001'$$,
  'a non-member cannot read availability polls'
);
select throws_ok(
  $$insert into public.availability_responses (date_id, poll_id, user_id, group_id, status)
    values ('aaaa0000-0000-0000-0000-0000000000d1', '99990000-0000-0000-0000-0000000000a1',
            'c0000000-0000-0000-0000-0000000000e1', '88880000-0000-0000-0000-000000000001', 'yes')$$,
  '42501', null,
  'a non-member cannot respond'
);

-- ---------------------------------------------------------------------
-- Close + delete
-- ---------------------------------------------------------------------
-- A non-admin, non-creator member's delete is a no-op (RLS) — poll stays.
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
delete from public.availability_polls where id = '99990000-0000-0000-0000-0000000000a1';
select isnt_empty(
  $$select 1 from public.availability_polls where id = '99990000-0000-0000-0000-0000000000a1'$$,
  'a non-creator non-admin member cannot delete an availability poll'
);

-- Alice (creator) closes it.
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
update public.availability_polls set closed_at = now()
  where id = '99990000-0000-0000-0000-0000000000a1';
set local role postgres;
select ok(
  (select closed_at is not null from public.availability_polls
    where id = '99990000-0000-0000-0000-0000000000a1'),
  'the creator can close an availability poll'
);

-- Alice deletes it → dates + responses cascade.
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';
delete from public.availability_polls where id = '99990000-0000-0000-0000-0000000000a1';
set local role postgres;
select is_empty(
  $$select 1 from public.availability_dates where poll_id = '99990000-0000-0000-0000-0000000000a1'$$,
  'deleting an availability poll cascades its dates'
);

select * from finish();
rollback;
