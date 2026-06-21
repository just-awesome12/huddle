-- =====================================================================
-- 028 — user identity: bio + avatars bucket (Phase 14)
-- =====================================================================
-- Lets members personalize their identity: a short bio and a real
-- uploaded avatar.
--
-- avatars is a PUBLIC bucket — avatars are low-sensitivity shared
-- identity and render in many places (member lists, sidebar, wall), so
-- public URLs avoid per-render signing. Writes are owner-scoped: the
-- path's first segment must be the caller's user id (`${uid}/...`).
-- =====================================================================

alter table public.profiles
  add column bio text check (bio is null or length(bio) <= 160);

comment on column public.profiles.bio is
  'Short self-description (<=160 chars), shown on the member profile.';


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5 * 1024 * 1024, -- 5 MiB; the app compresses further
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- SELECT: public bucket — anyone may read (public URLs are served by the
-- storage CDN regardless; this keeps the storage API consistent).
create policy "avatars_select_all"
  on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'avatars');

-- INSERT/UPDATE/DELETE: owner only — the path's first segment is the
-- caller's user id.
create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = (select auth.uid())
  );

create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = (select auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = (select auth.uid())
  );

create policy "avatars_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1])::uuid = (select auth.uid())
  );
