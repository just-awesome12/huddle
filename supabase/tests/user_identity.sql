-- =====================================================================
-- user identity test suite (Phase 14)
-- =====================================================================
-- Coverage: profiles.bio column; avatars bucket exists + is public;
-- storage RLS — a user may write only their own `${uid}/...` folder.
-- =====================================================================

begin;

select plan(5);

select has_column('public', 'profiles', 'bio', 'profiles.bio exists');

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket exists and is public'
);

-- ---------------------------------------------------------------------
-- Seed a user
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());


-- ---------------------------------------------------------------------
-- Alice can write her own avatar folder, but not someone else's
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg')$$,
  'a user can upload to their own avatar folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb/avatar.jpg')$$,
  '42501', null,
  'a user cannot upload to another user''s avatar folder'
);

-- Alice can update her own bio (own-row RLS from migration 002).
update public.profiles set bio = 'hi there' where id = 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

set local role postgres;
select is(
  (select bio from public.profiles where id = 'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'hi there',
  'a user can set their own bio'
);


select * from finish();
rollback;
