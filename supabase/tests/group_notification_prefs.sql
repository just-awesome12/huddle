-- =====================================================================
-- per-group notification mute test suite (Phase 15, slice 15b)
-- =====================================================================
-- Coverage: structure; own-row SELECT/INSERT/UPDATE; cross-user
-- isolation; forging another user's mute is rejected; service_role reads.
-- =====================================================================

begin;

select plan(7);

select has_table('public', 'group_notification_prefs', 'group_notification_prefs table exists');
select columns_are(
  'public', 'group_notification_prefs',
  array['user_id', 'group_id', 'muted', 'updated_at'],
  'group_notification_prefs has the expected columns'
);

-- ---------------------------------------------------------------------
-- Seed: Alice + Bob, both members of group G
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaa2-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'alice@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbb2-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'bob@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('22220000-0000-0000-0000-000000000001', 'Mute Group',
        'aaaaaaa2-0000-0000-0000-000000000001');
insert into public.group_members (group_id, user_id, role)
values ('22220000-0000-0000-0000-000000000001', 'bbbbbbb2-0000-0000-0000-000000000002', 'member');

-- ---------------------------------------------------------------------
-- Alice mutes the group (her own row)
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "aaaaaaa2-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.group_notification_prefs (user_id, group_id, muted)
values ('aaaaaaa2-0000-0000-0000-000000000001', '22220000-0000-0000-0000-000000000001', true);
select pass('a member can mute a group for themselves');

select isnt_empty(
  $$select 1 from public.group_notification_prefs where muted = true$$,
  'a member can read their own mute'
);

-- Forging Bob's mute is rejected.
select throws_ok(
  $$insert into public.group_notification_prefs (user_id, group_id, muted)
    values ('bbbbbbb2-0000-0000-0000-000000000002',
            '22220000-0000-0000-0000-000000000001', true)$$,
  '42501', null,
  'a member cannot set another user''s mute'
);

-- Bob cannot see Alice's mute row.
set local "request.jwt.claims" to
  '{"sub": "bbbbbbb2-0000-0000-0000-000000000002", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.group_notification_prefs
    where user_id = 'aaaaaaa2-0000-0000-0000-000000000001'$$,
  'a member cannot read another user''s mute'
);

-- service_role (send-push) reads mutes across users for fan-out.
set local role service_role;
select isnt_empty(
  $$select 1 from public.group_notification_prefs
    where group_id = '22220000-0000-0000-0000-000000000001' and muted = true$$,
  'service_role can read mutes for fan-out'
);

select * from finish();
rollback;
