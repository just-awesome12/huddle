-- =====================================================================
-- account deletion — SET NULL de-attribution (Phase 10)
-- =====================================================================
-- Migration 018 made ideas.proposed_by and decisions.run_by SET NULL on
-- profile deletion. This verifies that deleting a member's profile:
--   - keeps their idea (proposed_by -> NULL), so the chosen-idea NO
--     ACTION FK is never violated
--   - keeps the decision they ran (run_by -> NULL): append-only history
--     survives
--   - cascades away their membership
-- The full delete-account flow (sole-admin handling, solo-group cleanup)
-- is verified by the live probe — here we isolate the FK actions using a
-- non-last-admin member so the last-admin trigger isn't in play.
-- =====================================================================

begin;
select plan(6);

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
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Group (creator alice auto-admin via trigger); bob joins as member.
insert into public.groups (id, name, created_by)
values ('1ea61111-1111-1111-1111-111111111111', 'Test Group',
        'decade01-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role)
values ('1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222', 'member');

-- Bob proposes an idea and runs a picker that chooses it.
insert into public.ideas (id, group_id, proposed_by, title, category)
values ('1dea2222-2222-2222-2222-222222222222',
        '1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222', 'Sushi', 'food');

insert into public.decisions (id, group_id, run_by, chosen_idea_id, candidate_idea_ids)
values ('dec0b222-2222-2222-2222-222222222222',
        '1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222',
        '1dea2222-2222-2222-2222-222222222222',
        array['1dea2222-2222-2222-2222-222222222222']::uuid[]);


-- ---------------------------------------------------------------------
-- Delete bob's profile (simulates the account-deletion cascade for a
-- non-last-admin member). Should succeed and de-attribute, not destroy.
-- ---------------------------------------------------------------------
delete from public.profiles where id = 'decade02-2222-2222-2222-222222222222';

select isnt_empty(
  $$select 1 from public.ideas where id = '1dea2222-2222-2222-2222-222222222222'$$,
  'the deleted member''s idea survives (not cascaded away)'
);
select is(
  (select proposed_by from public.ideas where id = '1dea2222-2222-2222-2222-222222222222'),
  null,
  'idea.proposed_by is SET NULL (de-attributed)'
);
select isnt_empty(
  $$select 1 from public.decisions where id = 'dec0b222-2222-2222-2222-222222222222'$$,
  'the decision they ran survives (append-only history preserved)'
);
select is(
  (select run_by from public.decisions where id = 'dec0b222-2222-2222-2222-222222222222'),
  null,
  'decision.run_by is SET NULL (de-attributed)'
);
select is_empty(
  $$select 1 from public.group_members
    where user_id = 'decade02-2222-2222-2222-222222222222'$$,
  'their group membership is cascaded away'
);
select is_empty(
  $$select 1 from public.profiles where id = 'decade02-2222-2222-2222-222222222222'$$,
  'their profile is gone'
);

select * from finish();
rollback;
