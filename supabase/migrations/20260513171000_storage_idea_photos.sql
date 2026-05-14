-- =====================================================================
-- 012 — idea-photos storage bucket
-- =====================================================================
-- Private bucket for idea photos. Objects use the path convention:
--
--     {group_id}/{idea_id}/{filename}
--
-- Storage RLS policies extract group_id from the path's first
-- component (storage.foldername(name)[1]) and check group membership
-- via the same public.is_group_member() helper used by the tables.
--
-- Why a private bucket: even though listing objects is gated by RLS,
-- making the bucket public would mean a leaked object URL is forever
-- accessible. Private + signed URLs means access tokens expire.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------
-- Idempotent insert: re-running this migration via `supabase db reset`
-- should not error if the bucket happens to already exist.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'idea-photos',
  'idea-photos',
  false,
  10 * 1024 * 1024,  -- 10 MiB hard cap; the app compresses uploads further
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- RLS policies on storage.objects (scoped to this bucket)
-- ---------------------------------------------------------------------
-- Supabase ships with `storage.objects` already RLS-enabled. We add
-- policies that restrict the idea-photos bucket to group members.
--
-- storage.foldername(name) returns the path components as a text
-- array. For 'aaaa.../bbbb.../photo.jpg' it returns
-- {'aaaa...', 'bbbb...'}. The [1] subscript is group_id.

-- SELECT: members of the group can read.
create policy "idea_photos_select_member"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'idea-photos'
    and public.is_group_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- INSERT: members of the group can upload. We rely on the application
-- to choose the correct path; the RLS check verifies the path's first
-- segment is a group the caller is in.
create policy "idea_photos_insert_member"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'idea-photos'
    and public.is_group_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- UPDATE: members of the group can update (e.g., overwrite metadata).
create policy "idea_photos_update_member"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'idea-photos'
    and public.is_group_member(
      ((storage.foldername(name))[1])::uuid
    )
  )
  with check (
    bucket_id = 'idea-photos'
    and public.is_group_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- DELETE: members of the group can delete objects in their group's
-- folder. This is consistent with the ideas table: a member can
-- dismiss/delete an idea, and the cleanup of its photo belongs in
-- the same trust circle.
create policy "idea_photos_delete_member"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'idea-photos'
    and public.is_group_member(
      ((storage.foldername(name))[1])::uuid
    )
  );
