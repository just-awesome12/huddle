-- =====================================================================
-- decisions test suite (Phase 1.4)
-- =====================================================================
-- Coverage:
--   - Structure
--   - CHECK: candidates non-empty
--   - CHECK: chosen idea must be in candidates
--   - RLS: anon cannot read
--   - RLS: SELECT visible to members, hidden from non-members
--   - RLS: INSERT denied for ALL authenticated callers (service role only)
--   - RLS: UPDATE denied (no policy)
--   - RLS: DELETE denied (no policy)
--   - FK: a CHOSEN idea cannot be hard-deleted (NO ACTION, D60)
--   - FK: a candidate-only idea (array element, no FK) CAN be deleted
--   - Cascade: group delete removes decisions (and still works under
--     NO ACTION because the referencing decision goes in the same stmt)
--
-- UUID prefixes: idea = eeee...; decision = dec0... (valid hex)
-- =====================================================================

begin;
select plan(12);


-- ---------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------
select has_table('public', 'decisions', 'decisions table exists');


-- ---------------------------------------------------------------------
-- Seed
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

insert into public.ideas (id, group_id, proposed_by, title, category)
values
  ('1dea1111-1111-1111-1111-111111111111',
   '1ea61111-1111-1111-1111-111111111111',
   'decade01-1111-1111-1111-111111111111', 'Pizza', 'food'),
  ('1dea2222-2222-2222-2222-222222222222',
   '1ea61111-1111-1111-1111-111111111111',
   'decade01-1111-1111-1111-111111111111', 'Sushi', 'food');


-- ---------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.decisions
      (group_id, run_by, chosen_idea_id, candidate_idea_ids)
    values
      ('1ea61111-1111-1111-1111-111111111111',
       'decade01-1111-1111-1111-111111111111',
       '1dea1111-1111-1111-1111-111111111111',
       array[]::uuid[])$$,
  '23514',
  null,
  'empty candidate list is rejected'
);

select throws_ok(
  $$insert into public.decisions
      (group_id, run_by, chosen_idea_id, candidate_idea_ids)
    values
      ('1ea61111-1111-1111-1111-111111111111',
       'decade01-1111-1111-1111-111111111111',
       '1dea1111-1111-1111-1111-111111111111',
       array['1dea2222-2222-2222-2222-222222222222']::uuid[])$$,
  '23514',
  null,
  'chosen idea must appear in candidates'
);


-- ---------------------------------------------------------------------
-- Seed a valid decision row (as superuser, simulating Edge Function)
-- ---------------------------------------------------------------------
insert into public.decisions (id, group_id, run_by, chosen_idea_id, candidate_idea_ids)
values (
  'dec1d111-1111-1111-1111-111111111111',
  '1ea61111-1111-1111-1111-111111111111',
  'decade01-1111-1111-1111-111111111111',
  '1dea1111-1111-1111-1111-111111111111',
  array['1dea1111-1111-1111-1111-111111111111',
        '1dea2222-2222-2222-2222-222222222222']::uuid[]
);


-- ---------------------------------------------------------------------
-- RLS: anon
-- ---------------------------------------------------------------------
set local role anon;

select is_empty(
  $$select 1 from public.decisions$$,
  'anon role cannot read decisions'
);


-- ---------------------------------------------------------------------
-- RLS: SELECT
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.decisions where id = 'dec1d111-1111-1111-1111-111111111111'$$,
  'group member can read decisions'
);

set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.decisions where id = 'dec1d111-1111-1111-1111-111111111111'$$,
  'non-member cannot read decisions'
);


-- ---------------------------------------------------------------------
-- RLS: INSERT denied
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select throws_ok(
  $$insert into public.decisions
      (group_id, run_by, chosen_idea_id, candidate_idea_ids)
    values
      ('1ea61111-1111-1111-1111-111111111111',
       'decade01-1111-1111-1111-111111111111',
       '1dea1111-1111-1111-1111-111111111111',
       array['1dea1111-1111-1111-1111-111111111111']::uuid[])$$,
  '42501',
  null,
  'authenticated user CANNOT directly INSERT a decision'
);


-- ---------------------------------------------------------------------
-- RLS: UPDATE denied
-- ---------------------------------------------------------------------
update public.decisions
  set chosen_idea_id = '1dea2222-2222-2222-2222-222222222222'
  where id = 'dec1d111-1111-1111-1111-111111111111';

set local role postgres;
select is(
  (select chosen_idea_id from public.decisions
   where id = 'dec1d111-1111-1111-1111-111111111111'),
  '1dea1111-1111-1111-1111-111111111111'::uuid,
  'authenticated user CANNOT UPDATE a decision (no policy → row hidden)'
);


-- ---------------------------------------------------------------------
-- RLS: DELETE denied
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

delete from public.decisions where id = 'dec1d111-1111-1111-1111-111111111111';

set local role postgres;
select isnt_empty(
  $$select 1 from public.decisions where id = 'dec1d111-1111-1111-1111-111111111111'$$,
  'authenticated user CANNOT DELETE a decision'
);


-- ---------------------------------------------------------------------
-- FK: chosen idea is protected from hard-delete (D60)
-- ---------------------------------------------------------------------
-- Role is already postgres (superuser bypasses RLS but NOT FK checks),
-- so this isolates the foreign-key behavior. The decision row from above
-- still exists and chooses idea 1dea1111.
select throws_ok(
  $$delete from public.ideas
      where id = '1dea1111-1111-1111-1111-111111111111'$$,
  '23503',
  null,
  'a CHOSEN idea cannot be hard-deleted while a decision references it'
);

-- A candidate that was NOT chosen lives only in the uuid[] array, which
-- carries no foreign key, so it can still be deleted (leaving a harmless
-- dangling id in the historical candidate list).
select lives_ok(
  $$delete from public.ideas
      where id = '1dea2222-2222-2222-2222-222222222222'$$,
  'a candidate-only idea (no FK from decisions) can still be deleted'
);


-- ---------------------------------------------------------------------
-- Cascade
-- ---------------------------------------------------------------------
delete from public.groups where id = '1ea61111-1111-1111-1111-111111111111';

select is_empty(
  $$select 1 from public.decisions where group_id = '1ea61111-1111-1111-1111-111111111111'$$,
  'deleting a group cascades to remove its decisions'
);


select * from finish();
rollback;
