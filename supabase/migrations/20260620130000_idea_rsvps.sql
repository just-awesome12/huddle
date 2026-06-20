-- =====================================================================
-- 026 — idea RSVPs ("I'm in") (Phase 13 — hub engagement)
-- =====================================================================
-- Turns a dated idea into a plan with people: each member marks going /
-- maybe / not_going. One row per (idea, user), upserted.
--
-- group_id is denormalised onto the row (validated against the idea's
-- group on insert, mirroring idea_comments/D74) so RSVPs ride the
-- existing per-group realtime channel and RLS is a direct membership
-- check. user_id cascades on account delete (an RSVP is ephemeral, not
-- authored content — delete, don't de-attribute).
-- =====================================================================

create type public.rsvp_status as enum ('going', 'maybe', 'not_going');

create table public.idea_rsvps (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  status public.rsvp_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create index idea_rsvps_idea_idx on public.idea_rsvps (idea_id);
create index idea_rsvps_group_idx on public.idea_rsvps (group_id);

comment on table public.idea_rsvps is
  'Per-member RSVP on an idea (going/maybe/not_going). group_id denormalised for realtime + RLS.';

create trigger idea_rsvps_set_updated_at
  before update on public.idea_rsvps
  for each row execute function public.set_updated_at();

alter table public.idea_rsvps enable row level security;

-- SELECT: any group member sees who's in.
create policy idea_rsvps_select_member
  on public.idea_rsvps
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: a member RSVPs as themselves; group_id must match the idea's group.
create policy idea_rsvps_insert_own
  on public.idea_rsvps
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
    and group_id = (select group_id from public.ideas where id = idea_id)
  );

-- UPDATE: a member changes their own RSVP.
create policy idea_rsvps_update_own
  on public.idea_rsvps
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- DELETE: a member withdraws their own RSVP.
create policy idea_rsvps_delete_own
  on public.idea_rsvps
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: RSVP changes flow on the per-group channel (needs a clean
-- stack restart to take effect — lesson 18).
alter table public.idea_rsvps replica identity full;
alter publication supabase_realtime add table public.idea_rsvps;

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.idea_rsvps to anon, authenticated, service_role;
