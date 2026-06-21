-- =====================================================================
-- 032 — per-group notification muting (Phase 15, slice 15b)
-- =====================================================================
-- notification_prefs is global per event type. The user panel (esp. the
-- 45-member college club) flagged that a bursty group with no way to mute
-- *that group* forces members to mute the whole event type or uninstall.
-- This adds a per-(user, group) mute: when set, send-push skips that user
-- for any push originating in that group — orthogonal to the event-type
-- prefs. Absent row = not muted (default), mirroring the prefs default-on
-- philosophy (D66).
--
-- RLS own-row (a member manages their own mute); service_role reads for
-- the send-push fan-out.
-- =====================================================================

create table public.group_notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create index group_notification_prefs_group_idx on public.group_notification_prefs (group_id);

comment on table public.group_notification_prefs is
  'Per-(user, group) push mute. send-push skips muted users for that group; absent row = not muted. RLS own-row; service_role reads for fan-out.';

alter table public.group_notification_prefs enable row level security;

create policy group_notification_prefs_select_own
  on public.group_notification_prefs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy group_notification_prefs_insert_own
  on public.group_notification_prefs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy group_notification_prefs_update_own
  on public.group_notification_prefs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy group_notification_prefs_delete_own
  on public.group_notification_prefs
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.group_notification_prefs to anon, authenticated, service_role;
