-- =====================================================================
-- 029 — group identity: emoji + color + cover photo (Phase 14)
-- =====================================================================
-- Today a group's emoji + color are hashed from its id. Let admins pick
-- their own (and a cover photo), for ownership. All three are optional;
-- group-visuals falls back to the hash when unset.
--
-- group-covers is a PUBLIC bucket (covers are decorative group identity,
-- shown on the banner). Writes are admin-scoped: path = `${groupId}/...`.
-- =====================================================================

alter table public.groups
  add column emoji text check (emoji is null or char_length(emoji) between 1 and 16),
  add column color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  add column cover_photo_path text;

comment on column public.groups.emoji is 'Admin-chosen group emoji (null = hashed default).';
comment on column public.groups.color is 'Admin-chosen accent hex #RRGGBB (null = hashed default).';
comment on column public.groups.cover_photo_path is 'Path in the group-covers bucket (null = none).';


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-covers',
  'group-covers',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- SELECT: public bucket — anyone may read.
create policy "group_covers_select_all"
  on storage.objects
  for select
  to authenticated, anon
  using (bucket_id = 'group-covers');

-- INSERT/UPDATE/DELETE: group admins only, scoped to their group's folder.
create policy "group_covers_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'group-covers'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "group_covers_update_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'group-covers'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'group-covers'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "group_covers_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'group-covers'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );
