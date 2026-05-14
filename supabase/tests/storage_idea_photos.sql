-- =====================================================================
-- idea-photos storage RLS test suite (Phase 1.4)
-- =====================================================================
-- WHAT THIS FILE TESTS:
-- The storage policies for the idea-photos bucket use this expression
-- as the authorization check:
--
--     bucket_id = 'idea-photos'
--     and public.is_group_member(((storage.foldername(name))[1])::uuid)
--
-- This file proves that the expression returns the right boolean for
-- every (caller, path) combination. The bucket configuration itself
-- (private flag, MIME types, size limit) is also verified.
--
-- WHAT IT DOES NOT TEST:
-- End-to-end SELECT/INSERT/DELETE against storage.objects. We cannot
-- disable the Supabase production-safety triggers (DISABLE TRIGGER
-- USER requires table ownership, and storage.objects is owned by
-- supabase_storage_admin, not postgres). Those end-to-end paths will
-- be covered in Phase 5 via an integration test using supabase-js
-- against a real Supabase instance.
-- =====================================================================

begin;
select plan(9);


-- ---------------------------------------------------------------------
-- Bucket configuration sanity checks
-- ---------------------------------------------------------------------
select is(
  (select public from storage.buckets where id = 'idea-photos'),
  false,
  'idea-photos bucket exists and is private'
);

select is(
  (select file_size_limit from storage.buckets where id = 'idea-photos'),
  (10 * 1024 * 1024)::bigint,
  'idea-photos enforces a 10 MiB size limit'
);

select is(
  (select allowed_mime_types from storage.buckets where id = 'idea-photos'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'idea-photos allows only safe image MIME types'
);


-- ---------------------------------------------------------------------
-- Seed users + group membership
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

insert into public.groups (id, name, created_by) values
  ('1ea61111-1111-1111-1111-111111111111', 'Alice Group',
   'decade01-1111-1111-1111-111111111111'),
  ('1ea63333-3333-3333-3333-333333333333', 'Carol Group',
   'decade03-3333-3333-3333-333333333333');

-- Bob is a member of Alice's group (id ends in a-string).
-- Carol's group has only Carol (the auto-add-creator trigger).
insert into public.group_members (group_id, user_id, role)
values ('1ea61111-1111-1111-1111-111111111111',
        'decade02-2222-2222-2222-222222222222', 'member');


-- ---------------------------------------------------------------------
-- storage.foldername correctness
-- ---------------------------------------------------------------------
-- We rely on storage.foldername(name) extracting the first path
-- component (the group_id). Confirm this directly.
select is(
  (storage.foldername('1ea61111-1111-1111-1111-111111111111/idea-x/photo.jpg'))[1],
  '1ea61111-1111-1111-1111-111111111111',
  'storage.foldername extracts group_id as first path component'
);


-- ---------------------------------------------------------------------
-- Authorization expression evaluation
-- ---------------------------------------------------------------------
-- The expression `public.is_group_member(((storage.foldername(name))[1])::uuid)`
-- is what the policies USING/WITH CHECK clauses evaluate. We call it
-- directly under each role and assert the return.

-- Bob (member of Alice's group) against Alice's group folder → true.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select ok(
  public.is_group_member(
    ((storage.foldername('1ea61111-1111-1111-1111-111111111111/idea-x/photo.jpg'))[1])::uuid
  ),
  'member is authorized for their own group folder'
);

-- Bob against Carol's group folder → false.
select ok(
  not public.is_group_member(
    ((storage.foldername('1ea63333-3333-3333-3333-333333333333/idea-y/photo.jpg'))[1])::uuid
  ),
  'member is NOT authorized for another group folder'
);

-- Carol against Alice's group folder → false (she isn't a member).
set local "request.jwt.claims" to '{"sub": "decade03-3333-3333-3333-333333333333", "role": "authenticated"}';

select ok(
  not public.is_group_member(
    ((storage.foldername('1ea61111-1111-1111-1111-111111111111/idea-x/photo.jpg'))[1])::uuid
  ),
  'non-member is NOT authorized for a group folder they do not belong to'
);

-- Carol against her own group folder → true.
select ok(
  public.is_group_member(
    ((storage.foldername('1ea63333-3333-3333-3333-333333333333/idea-y/photo.jpg'))[1])::uuid
  ),
  'creator-only group: lone member IS authorized for their group folder'
);


-- ---------------------------------------------------------------------
-- Anonymous caller
-- ---------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" to '{}';

select ok(
  not public.is_group_member(
    ((storage.foldername('1ea61111-1111-1111-1111-111111111111/idea-x/photo.jpg'))[1])::uuid
  ),
  'anonymous caller is NOT authorized for any group folder'
);


select * from finish();
rollback;
