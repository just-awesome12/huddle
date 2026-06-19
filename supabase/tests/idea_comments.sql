-- =====================================================================
-- idea_comments test suite (Phase 11 — discussion)
-- =====================================================================
-- Coverage: structure; member can comment + members read; non-member
-- can't comment; group_id must match the idea's group; author can delete
-- own; group admin can delete others'; a plain member can't delete
-- others'; a blocked author's comment is hidden from the blocker.
-- =====================================================================

begin;
select plan(8);

select has_table('public', 'idea_comments', 'idea_comments table exists');

set local role postgres;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','aaaa1111-1111-1111-1111-111111111111',
   'authenticated','authenticated','alice@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','bbbb2222-2222-2222-2222-222222222222',
   'authenticated','authenticated','bob@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','cccc3333-3333-3333-3333-333333333333',
   'authenticated','authenticated','carol@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','dddd4444-4444-4444-4444-444444444444',
   'authenticated','authenticated','dave@example.com',crypt('p',gen_salt('bf')),'{}','{}',now(),now());

-- alice = admin (creator); bob, carol members; dave non-member.
insert into public.groups (id, name, created_by)
values ('9111aaaa-1111-1111-1111-111111111111','Cmt Group','aaaa1111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role) values
  ('9111aaaa-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222','member'),
  ('9111aaaa-1111-1111-1111-111111111111','cccc3333-3333-3333-3333-333333333333','member');
insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea1111-1111-1111-1111-111111111111','9111aaaa-1111-1111-1111-111111111111',
        'aaaa1111-1111-1111-1111-111111111111','Tacos','food');

-- ---------------------------------------------------------------------
-- bob (member) comments
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"bbbb2222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.idea_comments (id, idea_id, group_id, author_id, body)
values ('c0de1111-1111-1111-1111-111111111111','1dea1111-1111-1111-1111-111111111111',
        '9111aaaa-1111-1111-1111-111111111111','bbbb2222-2222-2222-2222-222222222222','first!');
select pass('a member can comment on an idea');

-- group_id must match the idea's group
select throws_ok(
  $$insert into public.idea_comments (idea_id, group_id, author_id, body)
    values ('1dea1111-1111-1111-1111-111111111111',
            '00000000-0000-0000-0000-000000000000',
            'bbbb2222-2222-2222-2222-222222222222','mismatch')$$,
  '42501', null, 'group_id must match the idea''s group'
);

-- ---------------------------------------------------------------------
-- dave (non-member) cannot comment
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"dddd4444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$insert into public.idea_comments (idea_id, group_id, author_id, body)
    values ('1dea1111-1111-1111-1111-111111111111',
            '9111aaaa-1111-1111-1111-111111111111',
            'dddd4444-4444-4444-4444-444444444444','intruder')$$,
  '42501', null, 'a non-member CANNOT comment'
);

-- ---------------------------------------------------------------------
-- carol (member) reads bob's comment; then blocks bob → hidden
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}';
select isnt_empty(
  $$select 1 from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111'$$,
  'a member can read the thread'
);
insert into public.blocked_users (blocker_id, blocked_id)
values ('cccc3333-3333-3333-3333-333333333333','bbbb2222-2222-2222-2222-222222222222');
select is_empty(
  $$select 1 from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111'$$,
  'a blocked author''s comment is hidden from the blocker'
);

-- ---------------------------------------------------------------------
-- delete: a plain member (carol) cannot delete bob's comment...
-- ---------------------------------------------------------------------
delete from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111';
set local role postgres;
select isnt_empty(
  $$select 1 from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111'$$,
  'a non-author, non-admin member cannot delete a comment'
);

-- ...but a group admin (alice) can.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"aaaa1111-1111-1111-1111-111111111111","role":"authenticated"}';
delete from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111';
set local role postgres;
select is_empty(
  $$select 1 from public.idea_comments where id = 'c0de1111-1111-1111-1111-111111111111'$$,
  'a group admin can delete any comment (moderation)'
);

select * from finish();
rollback;
