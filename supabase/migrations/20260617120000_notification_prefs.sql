-- =====================================================================
-- 016 — notification_prefs table
-- =====================================================================
-- Per-user, per-event push notification preferences (Phase 8). One row
-- per user, created lazily when they first change a setting. A MISSING
-- row means "opted in to everything" — the send-push Edge Function (and
-- the @huddle/core `shouldNotify` logic) treat absent prefs as all-on,
-- so we don't need a row per user up front.
--
-- send-push reads this table as service_role to decide who to notify.
-- =====================================================================


create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  new_idea boolean not null default true,
  picker_ran boolean not null default true,
  group_invite boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Per-user push notification toggles. Absent row = all events enabled.';


-- ---------------------------------------------------------------------
-- Row-Level Security — a user reads/writes only their own row.
-- ---------------------------------------------------------------------
alter table public.notification_prefs enable row level security;

create policy notification_prefs_select_own
  on public.notification_prefs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notification_prefs_insert_own
  on public.notification_prefs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy notification_prefs_update_own
  on public.notification_prefs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE policy: a prefs row lives as long as the profile (cascade).
