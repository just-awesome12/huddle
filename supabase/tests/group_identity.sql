-- =====================================================================
-- group identity test suite (Phase 14)
-- =====================================================================
-- Coverage: emoji/color/cover columns; color hex CHECK; group-covers
-- bucket; cover write RLS is admin-only.
-- =====================================================================

begin;

select plan(10);

select has_column('public', 'groups', 'emoji', 'groups.emoji exists');
select has_column('public', 'groups', 'color', 'groups.color exists');
select has_column('public', 'groups', 'cover_photo_path', 'groups.cover_photo_path exists');
select has_column('public', 'groups', 'lite_mode', 'groups.lite_mode exists (16d)');

select is(
  (select public from storage.buckets where id = 'group-covers'),
  true,
  'group-covers bucket exists and is public'
);

-- ---------------------------------------------------------------------
-- Seed: Alice (admin of G), Bob (member of G)
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
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.groups (id, name, created_by)
values ('9b00aa01-0000-0000-0000-000000000001', 'Group G',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.group_members (group_id, user_id, role)
values ('9b00aa01-0000-0000-0000-000000000001', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

-- Bad color hex is rejected by the CHECK.
select throws_ok(
  $$update public.groups set color = 'red' where id = '9b00aa01-0000-0000-0000-000000000001'$$,
  '23514', null,
  'a non-hex color is rejected'
);


-- ---------------------------------------------------------------------
-- Cover writes: admin yes, non-admin member no
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('group-covers', '9b00aa01-0000-0000-0000-000000000001/cover.jpg')$$,
  'an admin can upload a group cover'
);

set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('group-covers', '9b00aa01-0000-0000-0000-000000000001/evil.jpg')$$,
  '42501', null,
  'a non-admin member cannot upload a group cover'
);


-- ---------------------------------------------------------------------
-- Lite mode (16d): an admin can toggle it; a non-admin member cannot.
-- Rides the existing admin-only groups UPDATE policy (groups_update_admin)
-- — no dedicated lite_mode policy. A member's UPDATE matches no row under
-- the USING clause, so it is a silent no-op rather than an error.
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';
update public.groups set lite_mode = true
  where id = '9b00aa01-0000-0000-0000-000000000001';
set local role postgres;
select is(
  (select lite_mode from public.groups where id = '9b00aa01-0000-0000-0000-000000000001'),
  false,
  'a non-admin member cannot enable lite mode (UPDATE is a no-op)'
);

set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
update public.groups set lite_mode = true
  where id = '9b00aa01-0000-0000-0000-000000000001';
set local role postgres;
select is(
  (select lite_mode from public.groups where id = '9b00aa01-0000-0000-0000-000000000001'),
  true,
  'an admin can enable lite mode'
);


select * from finish();
rollback;
