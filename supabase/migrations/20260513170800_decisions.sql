-- =====================================================================
-- 010 — decisions table
-- =====================================================================
-- A record of one run of the random picker. Append-only by design:
-- the picker writes a row, and no client can ever modify or delete
-- it. This is what makes the history view trustworthy.
--
-- INSERT happens only via the run_picker Edge Function (Phase 7),
-- which runs as service_role and therefore bypasses RLS. There is
-- no INSERT policy here, so a client calling the REST API directly
-- cannot record a decision.
-- =====================================================================


create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  run_by uuid not null references public.profiles(id) on delete cascade,
  chosen_idea_id uuid not null references public.ideas(id) on delete cascade,
  candidate_idea_ids uuid[] not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- The picker must consider at least one candidate (the one it picks).
  -- The chosen idea must appear in the candidate list.
  constraint decisions_candidates_nonempty check (
    array_length(candidate_idea_ids, 1) >= 1
  ),
  constraint decisions_chosen_in_candidates check (
    chosen_idea_id = any(candidate_idea_ids)
  )
);

comment on table public.decisions is
  'Append-only history of picker runs. INSERT only via service role.';

create index decisions_group_id_idx on public.decisions (group_id);
create index decisions_chosen_idea_id_idx on public.decisions (chosen_idea_id);
create index decisions_created_at_idx on public.decisions (created_at desc);


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.decisions enable row level security;

-- SELECT: any member of the group.
create policy decisions_select_member
  on public.decisions
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: no policy. The run_picker Edge Function uses service_role.
-- A client calling INSERT directly will get an RLS denial.

-- UPDATE: no policy. Decisions are immutable.

-- DELETE: no policy. Decisions are immutable.
-- (The only deletion path is the cascade from groups deletion, which
-- is intentional — if the group itself is gone, its history can go.)
