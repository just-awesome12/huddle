-- =====================================================================
-- 038 — availability "when's free?" polls (Phase 16, slice 16b)
-- =====================================================================
-- The deepest coordination pain (distributed team, family across
-- timezones): finding a date everyone can do. Distinct from a counted
-- poll (037) — there each member picks ONE option; here each member marks
-- EACH proposed date yes / maybe / no, and the group reads the overlap.
-- Modeled on RSVP (D84): a status per (date, member).
--
-- event_date is a plain tz-naive `date` (D75 — same YYYY-MM-DD the idea
-- date uses, no cross-timezone drift). group_id + poll_id are denormalized
-- on dates/responses (D74) so RLS stays a flat is_group_member check and
-- a poll's responses are queryable without a join. Not in the realtime
-- publication for v1 — tallies refresh on the responder's revalidate.
-- =====================================================================

create table public.availability_polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint availability_polls_title_length check (char_length(title) between 1 and 200)
);

create index availability_polls_group_idx on public.availability_polls (group_id, created_at desc);

create table public.availability_dates (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.availability_polls(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  event_date date not null,
  position integer not null default 0,
  unique (poll_id, event_date)
);

create index availability_dates_poll_idx on public.availability_dates (poll_id, event_date);

create table public.availability_responses (
  date_id uuid not null references public.availability_dates(id) on delete cascade,
  poll_id uuid not null references public.availability_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (date_id, user_id),
  constraint availability_responses_status_check check (status in ('yes', 'maybe', 'no'))
);

create index availability_responses_poll_idx on public.availability_responses (poll_id);

comment on table public.availability_polls is
  'When-are-you-free polls (16b): a member marks yes/maybe/no per proposed date; the group reads the overlap. RLS = is_group_member; group_id/poll_id denormalized.';

alter table public.availability_polls enable row level security;
alter table public.availability_dates enable row level security;
alter table public.availability_responses enable row level security;

-- ---------------------------------------------------------------------
-- availability_polls
-- ---------------------------------------------------------------------
create policy availability_polls_select_member
  on public.availability_polls for select to authenticated
  using (public.is_group_member(group_id));

create policy availability_polls_insert_member
  on public.availability_polls for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));

create policy availability_polls_update_author_or_admin
  on public.availability_polls for update to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id))
  with check (public.is_group_member(group_id));

create policy availability_polls_delete_author_or_admin
  on public.availability_polls for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));

-- ---------------------------------------------------------------------
-- availability_dates: only the poll's creator proposes dates
-- ---------------------------------------------------------------------
create policy availability_dates_select_member
  on public.availability_dates for select to authenticated
  using (public.is_group_member(group_id));

create policy availability_dates_insert_creator
  on public.availability_dates for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and exists (
      select 1 from public.availability_polls p
      where p.id = poll_id and p.created_by = (select auth.uid())
    )
  );

create policy availability_dates_delete_author_or_admin
  on public.availability_dates for delete to authenticated
  using (
    public.is_group_admin(group_id)
    or exists (
      select 1 from public.availability_polls p
      where p.id = poll_id and p.created_by = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- availability_responses: a member marks ONLY their own status, and the
-- date must belong to the same poll + group.
-- ---------------------------------------------------------------------
create policy availability_responses_select_member
  on public.availability_responses for select to authenticated
  using (public.is_group_member(group_id));

create policy availability_responses_insert_own
  on public.availability_responses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.availability_dates d
      where d.id = date_id and d.poll_id = availability_responses.poll_id
        and d.group_id = availability_responses.group_id
    )
  );

create policy availability_responses_update_own
  on public.availability_responses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy availability_responses_delete_own
  on public.availability_responses for delete to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.availability_polls to anon, authenticated, service_role;
grant all on public.availability_dates to anon, authenticated, service_role;
grant all on public.availability_responses to anon, authenticated, service_role;
