-- =====================================================================
-- 027 — emoji reactions (Phase 13 — hub engagement)
-- =====================================================================
-- Lightweight expression on ideas, picker decisions, and comments. One
-- row per (target, user, emoji): a user may add several distinct emojis
-- to a target but not the same one twice (unique).
--
-- Polymorphic: target_type + target_id, no FK to the target (the three
-- target tables differ). group_id is denormalised so reactions ride the
-- per-group realtime channel and RLS is a direct membership check; a
-- group delete cascades reactions via that FK. A reaction can outlive a
-- deleted idea/comment as a harmless orphan (never fetched — queries are
-- keyed by target_id, which no longer renders).
-- =====================================================================

create type public.reaction_target as enum ('idea', 'decision', 'comment');

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  target_type public.reaction_target not null,
  target_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint reactions_emoji_check check (emoji in ('👍', '🎉', '🔥', '😂', '😮', '🙌')),
  unique (target_type, target_id, user_id, emoji)
);

create index reactions_group_idx on public.reactions (group_id);
create index reactions_target_idx on public.reactions (target_type, target_id);

comment on table public.reactions is
  'Emoji reactions on ideas/decisions/comments. Polymorphic; group_id denormalised for realtime + RLS.';

alter table public.reactions enable row level security;

-- SELECT: any group member sees the reactions.
create policy reactions_select_member
  on public.reactions
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: a member reacts as themselves within a group they belong to.
create policy reactions_insert_own
  on public.reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
  );

-- DELETE: a member removes their own reaction. No UPDATE.
create policy reactions_delete_own
  on public.reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: reactions flow on the per-group channel (needs a clean stack
-- restart to take effect — lesson 18).
alter table public.reactions replica identity full;
alter publication supabase_realtime add table public.reactions;

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.reactions to anon, authenticated, service_role;
