-- =====================================================================
-- 003 — groups table
-- =====================================================================
-- A "group" is the unit of collaboration in Huddle. Members of a group
-- post ideas, see history, and run the random picker.
--
-- This migration creates the table with a temporary RLS posture: only
-- the creator can interact with the group. Phase 1.3 adds the
-- group_members table and updates these policies so that all members
-- (not just the creator) can read the group and members can leave it.
--
-- Why this two-phase approach: defining "members can read" requires
-- the group_members table to exist. Rather than write a policy now
-- and rewrite it next phase, we ship the only access rule we can
-- express completely today (creator-only) and widen it atomically in
-- 1.3 alongside the membership table itself.
-- =====================================================================


create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length check (length(trim(name)) between 1 and 80)
);

comment on table public.groups is
  'A collaboration unit. Members post ideas and run the random picker.';


-- ---------------------------------------------------------------------
-- Trigger: trim leading/trailing whitespace from name
-- ---------------------------------------------------------------------
-- The CHECK constraint already rejects all-whitespace names. The
-- trigger normalises useful-but-sloppy input ("  Game Night ") into
-- the canonical form ("Game Night") before the CHECK runs.
create or replace function public.trim_group_name()
returns trigger
language plpgsql
as $$
begin
  new.name := trim(new.name);
  return new;
end;
$$;

create trigger groups_trim_name
  before insert or update of name on public.groups
  for each row execute function public.trim_group_name();


-- ---------------------------------------------------------------------
-- Trigger: updated_at maintenance (uses the helper from migration 002)
-- ---------------------------------------------------------------------
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
-- Most queries against groups will filter or join by created_by
-- (to list a user's groups) until Phase 1.3 introduces group_members.
-- After 1.3, the predominant access path will be via group_members.
create index groups_created_by_idx on public.groups (created_by);


-- ---------------------------------------------------------------------
-- Row-Level Security (Phase 1.2 — provisional)
-- ---------------------------------------------------------------------
alter table public.groups enable row level security;

-- INSERT: any authenticated user can create a group. created_by must
-- match the requester's auth.uid() to prevent forging "I'm starting
-- this group on someone else's behalf."
create policy groups_insert
  on public.groups
  for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

-- SELECT (provisional): only the creator can read the group today.
-- Phase 1.3 will replace this with a membership-aware policy.
create policy groups_select_creator
  on public.groups
  for select
  to authenticated
  using ((select auth.uid()) = created_by);

-- UPDATE: only the creator can update. Phase 1.3 will widen this to
-- "any admin member" once roles exist.
create policy groups_update_creator
  on public.groups
  for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

-- DELETE: only the creator can delete. Same widening note as UPDATE.
create policy groups_delete_creator
  on public.groups
  for delete
  to authenticated
  using ((select auth.uid()) = created_by);
