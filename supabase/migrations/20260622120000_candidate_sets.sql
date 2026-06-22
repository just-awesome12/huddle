-- =====================================================================
-- 035 — saved/reusable candidate sets (Phase 15, slice 15e)
-- =====================================================================
-- The "schedulerless half of recurring": a group that does the same thing
-- on a cadence (Friday dinner, weekly game night) re-picks from the same
-- handful of ideas every time. A candidate set is a named, reusable
-- shortlist of idea ids that the picker can load in one tap (it just
-- pre-fills the existing run_picker `shortlist`, D60/D63 — so a real
-- scheduler isn't needed for the common "same options, again" case).
--
-- idea_ids is a plain uuid[] (Postgres can't FK array elements). Stale ids
-- (a deleted idea) are harmless: run_picker intersects the shortlist with
-- the live on-radar pool, so they're simply ignored.
--
-- RLS: any member sees/saves the group's sets (shared, like the picker
-- itself); the author or an admin can edit/delete. created_by is SET NULL
-- on account deletion (D71). Not in the realtime publication — sets are
-- picker config, fetched fresh when the picker opens, not live content.
-- =====================================================================

create table public.candidate_sets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  idea_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint candidate_sets_name_length check (char_length(name) between 1 and 60),
  constraint candidate_sets_ideas_count check (cardinality(idea_ids) between 2 and 50)
);

create index candidate_sets_group_idx on public.candidate_sets (group_id, created_at desc);

comment on table public.candidate_sets is
  'Named reusable shortlists for the picker (schedulerless recurring, 15e). idea_ids is a plain uuid[] intersected with the live on-radar pool at pick time; RLS member SELECT/INSERT, author-or-admin UPDATE/DELETE.';

alter table public.candidate_sets enable row level security;

-- SELECT: any group member (sets are shared group config).
create policy candidate_sets_select_member
  on public.candidate_sets
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: a member saves a set as themselves.
create policy candidate_sets_insert_member
  on public.candidate_sets
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- UPDATE: the author (rename / refresh the ids) or a group admin.
create policy candidate_sets_update_author_or_admin
  on public.candidate_sets
  for update
  to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id))
  with check (public.is_group_member(group_id));

-- DELETE: the author or a group admin (housekeeping / moderation).
create policy candidate_sets_delete_author_or_admin
  on public.candidate_sets
  for delete
  to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.candidate_sets to anon, authenticated, service_role;
