-- =====================================================================
-- reactions RLS test suite (Phase 13)
-- =====================================================================
-- Coverage: members react/unreact within their group; one emoji per
-- (target,user) but multiple distinct emojis allowed; the emoji set is
-- enforced; non-members and impersonation are rejected; anon sees none.
-- =====================================================================

begin;

select plan(10);

select has_table('public', 'reactions', 'reactions table exists');

-- ---------------------------------------------------------------------
-- Seed: Alice (admin of G), Bob (member of G), Carol (non-member)
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
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.group_members (group_id, user_id, role)
values ('9b00aa01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea0a01-0000-0000-0000-000000000001', '9b00aa01-0000-0000-0000-000000000001',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Taco Night', 'food');


-- ---------------------------------------------------------------------
-- Bob (member): react, add a second emoji, reject a duplicate
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

select lives_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '🔥')$$,
  'member can react to an idea in their group'
);

select lives_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '🎉')$$,
  'a second distinct emoji on the same target is allowed'
);

select throws_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '🔥')$$,
  '23505', null,
  'the same emoji twice on a target is rejected (unique)'
);

select throws_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lol')$$,
  '23514', null,
  'an emoji outside the allowed set is rejected'
);


-- ---------------------------------------------------------------------
-- Carol (non-member): cannot see or react
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0c-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.reactions where group_id = '9b00aa01-0000-0000-0000-000000000001'$$,
  'a non-member sees no reactions'
);

select throws_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0c-cccc-cccc-cccc-cccccccccccc', '👍')$$,
  '42501', null,
  'a non-member cannot react'
);


-- ---------------------------------------------------------------------
-- Bob: cannot impersonate; can remove own
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

select throws_ok(
  $$insert into public.reactions (group_id, target_type, target_id, user_id, emoji)
    values ('9b00aa01-0000-0000-0000-000000000001', 'idea',
            '1dea0a01-0000-0000-0000-000000000001', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '👍')$$,
  '42501', null,
  'cannot react on behalf of another user'
);

delete from public.reactions
  where target_type = 'idea'
    and target_id = '1dea0a01-0000-0000-0000-000000000001'
    and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    and emoji = '🎉';

set local role postgres;
select is(
  (select count(*)::int from public.reactions
    where target_id = '1dea0a01-0000-0000-0000-000000000001'),
  1,
  'member can remove their own reaction (the 🔥 remains)'
);


-- ---------------------------------------------------------------------
-- anon: blocked
-- ---------------------------------------------------------------------
set local role anon;
select is_empty($$select 1 from public.reactions$$, 'anon sees no reactions');


select * from finish();
rollback;
