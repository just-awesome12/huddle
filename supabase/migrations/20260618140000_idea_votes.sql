-- =====================================================================
-- 021 — idea upvotes (Phase 11 — from the user-panel "agree first" gap)
-- =====================================================================
-- Members can upvote ideas. This is the lightweight "let's try to agree"
-- step before falling back to the random picker, and lets the list show
-- what's popular. One vote per (idea, user).
-- =====================================================================

create table public.idea_votes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index idea_votes_idea_id_idx on public.idea_votes (idea_id);

comment on table public.idea_votes is
  'One upvote per (idea, user). Counts shown to group members; the picker stays random (D60).';

alter table public.idea_votes enable row level security;

-- SELECT: any member of the idea's group (so everyone sees vote counts).
create policy idea_votes_select_member
  on public.idea_votes
  for select
  to authenticated
  using (
    public.is_group_member((select group_id from public.ideas where id = idea_id))
  );

-- INSERT: a member may vote as themselves on an idea in their group.
create policy idea_votes_insert_own
  on public.idea_votes
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member((select group_id from public.ideas where id = idea_id))
  );

-- DELETE: a user may remove their own vote.
create policy idea_votes_delete_own
  on public.idea_votes
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No UPDATE policy: a vote is a presence row, nothing to update.
