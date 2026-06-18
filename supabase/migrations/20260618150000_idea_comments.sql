-- =====================================================================
-- 022 — idea comments / discussion (Phase 11 — user-panel #2)
-- =====================================================================
-- The product promises members "share ideas and discuss them", but
-- there was no discussion surface. Add threaded-flat comments per idea.
--
-- group_id is denormalised onto the row (validated against the idea's
-- group on insert) so comments ride the existing per-group realtime
-- channel (which filters by group_id) and so RLS is a direct membership
-- check. author_id is ON DELETE SET NULL — consistent with D71: deleting
-- an account de-attributes ("former member"), it doesn't wipe the thread.
-- =====================================================================

create table public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint idea_comments_body_length check (char_length(body) between 1 and 2000)
);

create index idea_comments_idea_idx on public.idea_comments (idea_id, created_at);
create index idea_comments_group_idx on public.idea_comments (group_id);

comment on table public.idea_comments is
  'Flat discussion thread per idea. group_id denormalised for realtime + RLS; author de-attributed on account deletion.';

alter table public.idea_comments enable row level security;

-- SELECT: group members, minus comments authored by users you've blocked
-- (mirrors the ideas block-hiding from D72; applies to realtime too).
create policy idea_comments_select_member
  on public.idea_comments
  for select
  to authenticated
  using (
    public.is_group_member(group_id)
    and (
      author_id is null
      or not exists (
        select 1
        from public.blocked_users b
        where b.blocker_id = (select auth.uid())
          and b.blocked_id = idea_comments.author_id
      )
    )
  );

-- INSERT: a member posts as themselves; group_id must match the idea's group.
create policy idea_comments_insert_member
  on public.idea_comments
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id)
    and group_id = (select group_id from public.ideas where id = idea_id)
  );

-- DELETE: the author, or a group admin (moderation). No UPDATE (no edit v1).
create policy idea_comments_delete_author_or_admin
  on public.idea_comments
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_group_admin(group_id)
  );

-- Realtime: members see new comments live on the per-group channel.
alter table public.idea_comments replica identity full;
alter publication supabase_realtime add table public.idea_comments;
