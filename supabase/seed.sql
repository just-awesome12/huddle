-- =====================================================================
-- Local dev seed data
-- =====================================================================
-- This file runs automatically on `supabase db reset`. It populates
-- the local database with two test users, one group both are in,
-- some ideas, and one historical decision.
--
-- DO NOT commit anything sensitive here. This file ends up in the
-- repo and runs on every developer's machine.
--
-- Test users:
--   alice@huddle.test / password123    (admin of "Pizza Night")
--   bob@huddle.test   / password123    (member of "Pizza Night")
-- =====================================================================


-- ---------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------
-- Insert into auth.users directly. In a real environment this happens
-- via the Auth API, but for seeding we shortcut it.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated',
   'alice@huddle.test',
   crypt('password123', gen_salt('bf')),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{}'::jsonb,
   now(), now(),
   now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated',
   'bob@huddle.test',
   crypt('password123', gen_salt('bf')),
   '{"provider": "email", "providers": ["email"]}'::jsonb,
   '{}'::jsonb,
   now(), now(),
   now())
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- Profile cleanup: the handle_new_user trigger creates placeholders
-- like 'u_111111111111'. Update them to friendlier handles for dev.
-- ---------------------------------------------------------------------
update public.profiles
  set username = 'alice', display_name = 'Alice'
  where id = '11111111-1111-1111-1111-111111111111';

update public.profiles
  set username = 'bob', display_name = 'Bob'
  where id = '22222222-2222-2222-2222-222222222222';


-- ---------------------------------------------------------------------
-- Group: Alice creates "Pizza Night"; Bob joins.
-- ---------------------------------------------------------------------
insert into public.groups (id, name, created_by) values
  ('aaaa1111-1111-1111-1111-111111111111',
   'Pizza Night',
   '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- The on_group_created trigger added Alice as admin automatically.
-- Add Bob as a regular member.
insert into public.group_members (group_id, user_id, role) values
  ('aaaa1111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'member')
on conflict (group_id, user_id) do nothing;


-- ---------------------------------------------------------------------
-- Ideas — three on the radar, one already done
-- ---------------------------------------------------------------------
insert into public.ideas (
  id, group_id, proposed_by, title, description, category, status
) values
  ('eeee0001-0001-0001-0001-000000000001',
   'aaaa1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'Tony''s Pizzeria',
   'Old-school pizza joint downtown. Cash only.',
   'food', 'on_radar'),
  ('eeee0002-0002-0002-0002-000000000002',
   'aaaa1111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'Pizza making class',
   'That cooking studio on 4th Ave runs classes on Saturdays.',
   'activity', 'on_radar'),
  ('eeee0003-0003-0003-0003-000000000003',
   'aaaa1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'Frank''s Pizza',
   'Recommended by a friend; thin crust, great sauce.',
   'food', 'on_radar'),
  ('eeee0004-0004-0004-0004-000000000004',
   'aaaa1111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'Joe''s Pizza',
   'We went here last month. Solid 8/10.',
   'food', 'done')
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- Decision: a historical pick, showing Joe's Pizza was randomly
-- selected from a shortlist of three.
-- ---------------------------------------------------------------------
insert into public.decisions (
  id, group_id, run_by, chosen_idea_id, candidate_idea_ids, created_at
) values
  ('dec00001-0001-0001-0001-000000000001',
   'aaaa1111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   'eeee0004-0004-0004-0004-000000000004',
   array[
     'eeee0001-0001-0001-0001-000000000001',
     'eeee0002-0002-0002-0002-000000000002',
     'eeee0004-0004-0004-0004-000000000004'
   ]::uuid[],
   now() - interval '5 days')
on conflict (id) do nothing;
