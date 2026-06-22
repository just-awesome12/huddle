-- =====================================================================
-- group wall test suite (Phase 14)
-- =====================================================================
-- Coverage: structure; member SELECT/INSERT; non-member denied; author
-- + admin DELETE; blocked-author hiding; immutability (no UPDATE).
-- =====================================================================

begin;

select plan(14);

select has_table('public', 'group_posts', 'group_posts table exists');
select columns_are(
  'public', 'group_posts',
  array['id', 'group_id', 'author_id', 'body', 'created_at', 'pinned'],
  'group_posts has the expected columns'
);

-- ---------------------------------------------------------------------
-- Seed: Alice (admin of G), Bob (member of G), Carol (non-member)
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'alice@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000b1',
   'authenticated', 'authenticated', 'bob@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-0000000000c1',
   'authenticated', 'authenticated', 'carol@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('11110000-0000-0000-0000-000000000001', 'Wall Group',
        'a0000000-0000-0000-0000-0000000000a1');
insert into public.group_members (group_id, user_id, role)
values ('11110000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b1', 'member');

-- ---------------------------------------------------------------------
-- Bob (member) can post; Carol (non-member) cannot
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';

insert into public.group_posts (id, group_id, author_id, body)
values ('99990000-0000-0000-0000-0000000000b1',
        '11110000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-0000000000b1', 'anyone free this weekend?');
select pass('a member can post to the wall');

select isnt_empty(
  $$select 1 from public.group_posts where group_id = '11110000-0000-0000-0000-000000000001'$$,
  'a member can read the wall'
);

set local "request.jwt.claims" to
  '{"sub": "c0000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select throws_ok(
  $$insert into public.group_posts (group_id, author_id, body)
    values ('11110000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-0000000000c1', 'let me in')$$,
  '42501', null,
  'a non-member cannot post to the wall'
);
select is_empty(
  $$select 1 from public.group_posts where group_id = '11110000-0000-0000-0000-000000000001'$$,
  'a non-member cannot read the wall'
);

-- ---------------------------------------------------------------------
-- Immutability: no UPDATE policy → 0 rows changed
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
update public.group_posts set body = 'edited' where id = '99990000-0000-0000-0000-0000000000b1';
set local role postgres;
select is(
  (select body from public.group_posts where id = '99990000-0000-0000-0000-0000000000b1'),
  'anyone free this weekend?',
  'posts are immutable (no UPDATE policy)'
);

-- ---------------------------------------------------------------------
-- Pinning (15e): admin-only via the set_post_pinned RPC
-- ---------------------------------------------------------------------
set local role postgres;
select is(
  (select pinned from public.group_posts where id = '99990000-0000-0000-0000-0000000000b1'),
  false,
  'posts are unpinned by default'
);

-- A non-admin member cannot pin.
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
select throws_ok(
  $$select public.set_post_pinned('99990000-0000-0000-0000-0000000000b1', true)$$,
  '42501', null,
  'a non-admin member cannot pin a post'
);

-- The admin can pin.
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select lives_ok(
  $$select public.set_post_pinned('99990000-0000-0000-0000-0000000000b1', true)$$,
  'an admin can pin a post'
);
set local role postgres;
select is(
  (select pinned from public.group_posts where id = '99990000-0000-0000-0000-0000000000b1'),
  true,
  'the post is pinned after the admin pins it'
);

-- ---------------------------------------------------------------------
-- DELETE: the admin can moderate any post. (Done BEFORE any block —
-- Postgres requires a row be visible under the SELECT policy to be
-- deleted, so an admin who has blocked the author can't target it; the
-- product never hits that since blocking already hides the post.)
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
insert into public.group_posts (id, group_id, author_id, body)
values ('99990000-0000-0000-0000-0000000000b2',
        '11110000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-0000000000b1', 'second post');

set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
delete from public.group_posts where id = '99990000-0000-0000-0000-0000000000b2';
set local role postgres;
select is_empty(
  $$select 1 from public.group_posts where id = '99990000-0000-0000-0000-0000000000b2'$$,
  'an admin can delete any post (moderation)'
);

-- ---------------------------------------------------------------------
-- Blocked-author hiding: Alice blocks Bob → Bob's post vanishes for her
-- ---------------------------------------------------------------------
set local role postgres;
insert into public.blocked_users (blocker_id, blocked_id)
values ('a0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000b1');

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.group_posts where author_id = 'b0000000-0000-0000-0000-0000000000b1'$$,
  'a blocked author''s posts are hidden from the blocker'
);

-- Author can delete their own post (Bob isn't blocked from his own view).
set local "request.jwt.claims" to
  '{"sub": "b0000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
delete from public.group_posts where id = '99990000-0000-0000-0000-0000000000b1';
set local role postgres;
select is_empty(
  $$select 1 from public.group_posts where id = '99990000-0000-0000-0000-0000000000b1'$$,
  'an author can delete their own post'
);

select * from finish();
rollback;
