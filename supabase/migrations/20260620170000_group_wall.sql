-- =====================================================================
-- 030 — group wall / general chat (Phase 14)
-- =====================================================================
-- Comments are idea-scoped; there was no group-level thread for
-- "anyone free this weekend?" chatter. group_posts is a flat, per-group
-- wall, mirroring idea_comments (D74): RLS is a direct membership check,
-- blocked authors are hidden (D72), the row rides the existing per-group
-- realtime channel, and author_id is SET NULL on account deletion (D71).
-- @mentions + mention push are deferred.
-- =====================================================================

create table public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint group_posts_body_length check (char_length(body) between 1 and 2000)
);

create index group_posts_group_idx on public.group_posts (group_id, created_at desc);

comment on table public.group_posts is
  'Group-level wall / general chat. RLS = is_group_member; author de-attributed on account deletion; rides the per-group realtime channel.';

alter table public.group_posts enable row level security;

-- SELECT: group members, minus posts authored by users you've blocked.
create policy group_posts_select_member
  on public.group_posts
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
          and b.blocked_id = group_posts.author_id
      )
    )
  );

-- INSERT: a member posts as themselves.
create policy group_posts_insert_member
  on public.group_posts
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- DELETE: the author, or a group admin (moderation). No UPDATE (immutable v1).
create policy group_posts_delete_author_or_admin
  on public.group_posts
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_group_admin(group_id)
  );

-- Realtime: members see new posts live on the per-group channel.
alter table public.group_posts replica identity full;
alter publication supabase_realtime add table public.group_posts;

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.group_posts to anon, authenticated, service_role;
