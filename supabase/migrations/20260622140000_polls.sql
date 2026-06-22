-- =====================================================================
-- 037 — counted majority polls (Phase 16, slice 16a)
-- =====================================================================
-- The picker decides at random; sometimes a group wants to actually VOTE
-- on a question ("Which weekend?", "Pizza or sushi?"). A poll is a
-- question + a few options; each member casts one vote (changeable); the
-- group sees live-ish counts and the leading option. A creator/admin can
-- close a poll to finalize it.
--
-- poll_options.group_id and poll_votes.group_id are denormalized (D74) so
-- RLS is a flat is_group_member check and there's no cross-table join in
-- the policy. One vote per (poll, user) — the PK — so changing a vote is
-- an upsert. Not in the realtime publication for v1: counts refresh on the
-- voter's revalidate; cross-member live updates are a follow-up.
-- =====================================================================

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  question text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint polls_question_length check (char_length(question) between 1 and 200)
);

create index polls_group_idx on public.polls (group_id, created_at desc);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  constraint poll_options_label_length check (char_length(label) between 1 and 100)
);

create index poll_options_poll_idx on public.poll_options (poll_id, position);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index poll_votes_option_idx on public.poll_votes (option_id);

comment on table public.polls is
  'Counted majority polls (16a): a question + options, one vote per member, optional close. RLS = is_group_member; group_id denormalized on options/votes.';

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- ---------------------------------------------------------------------
-- polls: member reads; member creates as self; creator-or-admin
-- closes (UPDATE) and deletes.
-- ---------------------------------------------------------------------
create policy polls_select_member
  on public.polls for select to authenticated
  using (public.is_group_member(group_id));

create policy polls_insert_member
  on public.polls for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));

create policy polls_update_author_or_admin
  on public.polls for update to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id))
  with check (public.is_group_member(group_id));

create policy polls_delete_author_or_admin
  on public.polls for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));

-- ---------------------------------------------------------------------
-- poll_options: member reads; only the poll's creator adds options
-- (set at creation); creator-or-admin deletes (also cascades with poll).
-- ---------------------------------------------------------------------
create policy poll_options_select_member
  on public.poll_options for select to authenticated
  using (public.is_group_member(group_id));

create policy poll_options_insert_creator
  on public.poll_options for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and exists (
      select 1 from public.polls p
      where p.id = poll_id and p.created_by = (select auth.uid())
    )
  );

create policy poll_options_delete_author_or_admin
  on public.poll_options for delete to authenticated
  using (
    public.is_group_admin(group_id)
    or exists (
      select 1 from public.polls p
      where p.id = poll_id and p.created_by = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- poll_votes: member reads all (counts are public to the group); a
-- member casts/changes/withdraws ONLY their own vote, and the option
-- must belong to the same group (and, implicitly, the poll).
-- ---------------------------------------------------------------------
create policy poll_votes_select_member
  on public.poll_votes for select to authenticated
  using (public.is_group_member(group_id));

create policy poll_votes_insert_own
  on public.poll_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.poll_options o
      where o.id = option_id and o.poll_id = poll_votes.poll_id and o.group_id = poll_votes.group_id
    )
  );

create policy poll_votes_update_own
  on public.poll_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.poll_options o
      where o.id = option_id and o.poll_id = poll_votes.poll_id and o.group_id = poll_votes.group_id
    )
  );

create policy poll_votes_delete_own
  on public.poll_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.polls to anon, authenticated, service_role;
grant all on public.poll_options to anon, authenticated, service_role;
grant all on public.poll_votes to anon, authenticated, service_role;
