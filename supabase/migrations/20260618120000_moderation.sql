-- =====================================================================
-- 019 — content moderation: reports + user blocking (Phase 10, OQ-5/D53)
-- =====================================================================
-- Store requirement (Apple Guideline 1.2 / Google UGC): apps with
-- user-generated content must let users REPORT objectionable content and
-- BLOCK abusive users. v1 is report-and-review (D53) — no automated
-- scanning; reports land in a table for manual review (Supabase
-- dashboard / a future admin tool).
--
-- "Report" targets an idea (its text and photo are one unit). "Block"
-- hides the blocked user's ideas from the blocker everywhere — enforced
-- in the ideas SELECT policy below, so it also applies to Realtime.
-- =====================================================================

create type public.report_reason as enum (
  'spam', 'inappropriate', 'harassment', 'other'
);
create type public.report_status as enum (
  'open', 'reviewed', 'dismissed', 'actioned'
);


-- ---------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,

  constraint reports_details_length check (details is null or length(details) <= 1000),
  -- One report per user per idea (idempotent-ish; re-report is a no-op).
  constraint reports_reporter_idea_unique unique (reporter_id, idea_id)
);

create index reports_idea_id_idx on public.reports (idea_id);
create index reports_status_idx on public.reports (status) where status = 'open';

comment on table public.reports is
  'User reports of objectionable ideas. Append-only from clients; reviewed manually (service role / dashboard).';

alter table public.reports enable row level security;

-- INSERT: a member of the idea's group may report it as themselves.
create policy reports_insert_member
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.is_group_member(
      (select group_id from public.ideas where id = idea_id)
    )
  );

-- SELECT: a reporter sees their own reports (drives "Reported" UI state).
-- Reviewers read across all reports via service_role.
create policy reports_select_own
  on public.reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

-- No UPDATE/DELETE policy: reports are immutable from clients (review is
-- service-role only).


-- ---------------------------------------------------------------------
-- blocked_users
-- ---------------------------------------------------------------------
create table public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocked_users_no_self check (blocker_id <> blocked_id)
);

create index blocked_users_blocker_idx on public.blocked_users (blocker_id);

comment on table public.blocked_users is
  'A blocker no longer sees the blocked user''s ideas (enforced in ideas SELECT RLS).';

alter table public.blocked_users enable row level security;

-- A user manages only their own block list.
create policy blocked_users_select_own
  on public.blocked_users
  for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocked_users_insert_own
  on public.blocked_users
  for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

create policy blocked_users_delete_own
  on public.blocked_users
  for delete
  to authenticated
  using (blocker_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- Block-aware ideas visibility
-- ---------------------------------------------------------------------
-- Recreate the ideas SELECT policy to also hide ideas proposed by anyone
-- the viewer has blocked. With no blocks the predicate is always true,
-- so existing behaviour is unchanged. Applies to Realtime too (RLS is
-- evaluated per subscriber).
drop policy ideas_select_member on public.ideas;
create policy ideas_select_member
  on public.ideas
  for select
  to authenticated
  using (
    public.is_group_member(group_id)
    and (
      proposed_by is null
      or not exists (
        select 1
        from public.blocked_users b
        where b.blocker_id = (select auth.uid())
          and b.blocked_id = ideas.proposed_by
      )
    )
  );
