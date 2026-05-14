-- =====================================================================
-- ideas test suite (Phase 1.4)
-- =====================================================================
-- Coverage:
--   - Structure
--   - Title trim trigger and length CHECK
--   - RLS: anon cannot read
--   - RLS: SELECT visible to members, hidden from non-members
--   - RLS: INSERT requires membership + proposed_by = auth.uid()
--   - RLS: UPDATE allowed for any member; non-members blocked
--   - RLS: UPDATE cannot move an idea to a group the caller isn't in
--   - RLS: DELETE — proposer can delete own idea
--   - RLS: DELETE — non-proposer, non-admin cannot delete
--   - Cascade: deleting a group removes its ideas
--
-- UUID convention in this file:
--   user_id  = 1111..., 2222..., 3333...  (alice, bob, carol)
--   group_id = aaaa1111..., bbbb2222...
--   idea_id  = eeee1111..., eeee2222...  (e is valid hex)
-- =====================================================================

begin;
select plan(15);


-- ---------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------
select has_table('public', 'ideas', 'ideas table exists');

select columns_are(
  'public', 'ideas',
  array['id', 'group_id', 'proposed_by', 'title', 'description',
        'category', 'link', 'photo_path', 'status', 'created_at',
        'updated_at'],
  'ideas has the expected columns'
);


-- ---------------------------------------------------------------------
-- Seed: Alice + Bob in group A; Carol in no group
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'decade01-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade02-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bob@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade03-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'carol@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('1ea61111-1111-1111-1111-111111111111', 'Test Group',
        'decade01-1111-1111-1111-111111111111');

insert into public.group_members (group_id, user_id, role)
values ('1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222', 'member');


-- ---------------------------------------------------------------------
-- Title trim + length
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.ideas (id, group_id, proposed_by, title, category)
values (
  '1dea1111-1111-1111-1111-111111111111',
  '1ea61111-1111-1111-1111-111111111111',
  'decade01-1111-1111-1111-111111111111',
  '  Pizza Friday  ',
  'food'
);

set local role postgres;
select is(
  (select title from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'),
  'Pizza Friday',
  'title is trimmed on insert'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$insert into public.ideas (group_id, proposed_by, title, category)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade01-1111-1111-1111-111111111111',
            '   ', 'food')$$,
  '23514',
  null,
  'whitespace-only title is rejected'
);


-- ---------------------------------------------------------------------
-- RLS: anon
-- ---------------------------------------------------------------------
set local role anon;

select is_empty(
  $$select 1 from public.ideas$$,
  'anon role cannot read ideas'
);


-- ---------------------------------------------------------------------
-- RLS: SELECT visibility
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'$$,
  'group member can read ideas'
);

set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'$$,
  'non-member cannot read ideas'
);


-- ---------------------------------------------------------------------
-- RLS: INSERT
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.ideas (group_id, proposed_by, title, category)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade03-3333-3333-3333-333333333333',
            'Sneak Attack', 'other')$$,
  '42501',
  null,
  'non-member cannot insert an idea'
);

set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$insert into public.ideas (group_id, proposed_by, title, category)
    values ('1ea61111-1111-1111-1111-111111111111',
            'decade01-1111-1111-1111-111111111111',
            'Forged', 'other')$$,
  '42501',
  null,
  'proposed_by must equal auth.uid()'
);


-- ---------------------------------------------------------------------
-- RLS: UPDATE
-- ---------------------------------------------------------------------
update public.ideas
  set title = 'Pizza Friday — extra cheese'
  where id = '1dea1111-1111-1111-1111-111111111111';

set local role postgres;
select is(
  (select title from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'),
  'Pizza Friday — extra cheese',
  'a non-proposer member can update the title'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

update public.ideas
  set status = 'dismissed'
  where id = '1dea1111-1111-1111-1111-111111111111';

set local role postgres;
select is(
  (select status::text from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'),
  'on_radar',
  'non-member cannot update idea (RLS hides the row)'
);


-- ---------------------------------------------------------------------
-- RLS: UPDATE cannot relocate to another group
-- ---------------------------------------------------------------------
set local role postgres;
insert into public.groups (id, name, created_by)
values ('1ea62222-2222-2222-2222-222222222222', 'Carol Group',
        'decade03-3333-3333-3333-333333333333');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select throws_ok(
  $$update public.ideas
    set group_id = '1ea62222-2222-2222-2222-222222222222'
    where id = '1dea1111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'cannot relocate an idea into a group the caller is not a member of'
);


-- ---------------------------------------------------------------------
-- RLS: DELETE
-- ---------------------------------------------------------------------
-- Bob (member, not proposer) tries to delete Alice's idea → blocked.
delete from public.ideas where id = '1dea1111-1111-1111-1111-111111111111';

set local role postgres;
select isnt_empty(
  $$select 1 from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'$$,
  'non-proposer non-admin cannot delete an idea'
);

-- Alice (proposer + admin) deletes → succeeds.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.ideas where id = '1dea1111-1111-1111-1111-111111111111';

set local role postgres;
select is_empty(
  $$select 1 from public.ideas where id = '1dea1111-1111-1111-1111-111111111111'$$,
  'proposer can delete their own idea'
);


-- ---------------------------------------------------------------------
-- Cascade: deleting a group removes its ideas
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea2222-2222-2222-2222-222222222222',
        '1ea61111-1111-1111-1111-111111111111',
        'decade01-1111-1111-1111-111111111111',
        'Cascade test', 'other');

delete from public.groups where id = '1ea61111-1111-1111-1111-111111111111';

set local role postgres;
select is_empty(
  $$select 1 from public.ideas where id = '1dea2222-2222-2222-2222-222222222222'$$,
  'deleting a group cascades to remove its ideas'
);


select * from finish();
rollback;
