-- =====================================================================
-- idea_votes test suite (Phase 11 — upvotes)
-- =====================================================================
-- Coverage: structure; a member can vote + members see counts; a
-- non-member cannot vote; a user can't vote as someone else; one vote
-- per (idea,user); a user removes only their own vote.
-- =====================================================================

begin;
select plan(7);

select has_table('public', 'idea_votes', 'idea_votes table exists');

set local role postgres;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-1111-1111-1111-111111111111',
   'authenticated','authenticated','alice@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb2222-2222-2222-2222-222222222222',
   'authenticated','authenticated','bob@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','dddd4444-4444-4444-4444-444444444444',
   'authenticated','authenticated','dave@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now());

insert into public.groups (id, name, created_by)
values ('9111aaaa-1111-1111-1111-111111111111','Vote Group','aaaa1111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role)
values ('9111aaaa-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222','member');
insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea1111-1111-1111-1111-111111111111','9111aaaa-1111-1111-1111-111111111111',
        'aaaa1111-1111-1111-1111-111111111111','Tacos','food');

-- ---------------------------------------------------------------------
-- bob (member) votes
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"bbbb2222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.idea_votes (idea_id, user_id)
values ('1dea1111-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222');
select pass('a group member can upvote an idea');

-- duplicate vote rejected (PK)
select throws_ok(
  $$insert into public.idea_votes (idea_id, user_id)
    values ('1dea1111-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222')$$,
  '23505', null, 'one vote per (idea, user)'
);

-- alice (also a member) sees the vote count
set local "request.jwt.claims" to '{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.idea_votes where idea_id = '1dea1111-1111-1111-1111-111111111111'),
  1, 'members can read vote counts'
);

-- ---------------------------------------------------------------------
-- dave (non-member) cannot vote
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"dddd4444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$insert into public.idea_votes (idea_id, user_id)
    values ('1dea1111-1111-1111-1111-111111111111','dddd4444-4444-4444-4444-444444444444')$$,
  '42501', null, 'a non-member CANNOT vote'
);

-- ---------------------------------------------------------------------
-- can't vote as someone else
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$insert into public.idea_votes (idea_id, user_id)
    values ('1dea1111-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222')$$,
  '42501', null, 'cannot cast a vote as another user'
);

-- ---------------------------------------------------------------------
-- a user removes only their own vote (alice deleting bob's is a no-op)
-- ---------------------------------------------------------------------
delete from public.idea_votes
  where idea_id = '1dea1111-1111-1111-1111-111111111111'
    and user_id = 'bbbb2222-2222-2222-2222-222222222222';
set local role postgres;
select isnt_empty(
  $$select 1 from public.idea_votes
    where user_id = 'bbbb2222-2222-2222-2222-222222222222'$$,
  'a user cannot delete another user''s vote'
);

select * from finish();
rollback;
