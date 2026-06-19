-- =====================================================================
-- moderation test suite (Phase 10 — reports + blocked_users)
-- =====================================================================
-- Coverage:
--   - Structure (reports, blocked_users)
--   - reports RLS: member can report; non-member cannot; reporter sees
--     own, others can't; duplicate rejected
--   - blocked_users: self-block rejected
--   - block-aware ideas SELECT: a blocked user's idea is hidden from the
--     blocker but still visible to a non-blocking member
-- =====================================================================

begin;
select plan(10);

select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'blocked_users', 'blocked_users table exists');

-- ---------------------------------------------------------------------
-- Seed: alice (creator/admin), bob + carol (members), dave (non-member)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaa1111-1111-1111-1111-111111111111',
   'authenticated','authenticated','alice@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbb2222-2222-2222-2222-222222222222',
   'authenticated','authenticated','bob@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'cccc3333-3333-3333-3333-333333333333',
   'authenticated','authenticated','carol@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000', 'dddd4444-4444-4444-4444-444444444444',
   'authenticated','authenticated','dave@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now());

insert into public.groups (id, name, created_by)
values ('9111aaaa-1111-1111-1111-111111111111', 'Mod Group', 'aaaa1111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role) values
  ('9111aaaa-1111-1111-1111-111111111111', 'bbbb2222-2222-2222-2222-222222222222', 'member'),
  ('9111aaaa-1111-1111-1111-111111111111', 'cccc3333-3333-3333-3333-333333333333', 'member');

-- Bob proposes an idea.
insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1deab222-2222-2222-2222-222222222222',
        '9111aaaa-1111-1111-1111-111111111111',
        'bbbb2222-2222-2222-2222-222222222222', 'Bob idea', 'food');


-- ---------------------------------------------------------------------
-- reports: a member (carol) can report bob's idea
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}';

insert into public.reports (idea_id, reporter_id, reason, details)
values ('1deab222-2222-2222-2222-222222222222',
        'cccc3333-3333-3333-3333-333333333333', 'inappropriate', 'nope');
select pass('a group member can report an idea');

-- duplicate report by same reporter → unique violation
select throws_ok(
  $$insert into public.reports (idea_id, reporter_id, reason)
    values ('1deab222-2222-2222-2222-222222222222',
            'cccc3333-3333-3333-3333-333333333333', 'spam')$$,
  '23505', null, 'duplicate report by the same user is rejected'
);

-- reporter sees their own report
select isnt_empty(
  $$select 1 from public.reports where reporter_id = 'cccc3333-3333-3333-3333-333333333333'$$,
  'reporter can read their own report'
);

-- ---------------------------------------------------------------------
-- reports: a non-member (dave) cannot report
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"dddd4444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$insert into public.reports (idea_id, reporter_id, reason)
    values ('1deab222-2222-2222-2222-222222222222',
            'dddd4444-4444-4444-4444-444444444444', 'spam')$$,
  '42501', null, 'a non-member CANNOT report an idea'
);

-- a different user cannot read carol's report
select is_empty(
  $$select 1 from public.reports where reporter_id = 'cccc3333-3333-3333-3333-333333333333'$$,
  'a non-reporter cannot read someone else''s report'
);

-- ---------------------------------------------------------------------
-- blocked_users: self-block rejected
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$insert into public.blocked_users (blocker_id, blocked_id)
    values ('aaaa1111-1111-1111-1111-111111111111','aaaa1111-1111-1111-1111-111111111111')$$,
  '23514', null, 'a user cannot block themselves'
);

-- ---------------------------------------------------------------------
-- block-aware ideas visibility
-- ---------------------------------------------------------------------
-- Alice blocks bob → alice no longer sees bob's idea.
insert into public.blocked_users (blocker_id, blocked_id)
values ('aaaa1111-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222');
select is_empty(
  $$select 1 from public.ideas where id = '1deab222-2222-2222-2222-222222222222'$$,
  'a blocker no longer sees the blocked user''s idea'
);

-- Carol (no block) still sees bob's idea.
set local "request.jwt.claims" to '{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}';
select isnt_empty(
  $$select 1 from public.ideas where id = '1deab222-2222-2222-2222-222222222222'$$,
  'a non-blocking member still sees the idea'
);

select * from finish();
rollback;
