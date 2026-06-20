-- =====================================================================
-- 024 — Public, discoverable groups + join requests
-- =====================================================================
-- Adds a *scoped* softening of the members-only invariant: groups can be
-- marked `public`, which makes their METADATA (name, description,
-- location, tags, member count) discoverable to any authenticated user.
-- Their CONTENTS (ideas, members, decisions, invites) stay members-only —
-- those policies are untouched. Joining a public group is request-based:
-- a non-member files a request, a group admin approves or rejects it.
--
-- Discovery stays behind the auth wall (authenticated role only); the
-- Phase 9 anti-scraping posture (robots noindex, Turnstile, deferred
-- Cloudflare) is otherwise unchanged.
-- =====================================================================


-- pg_trgm powers ilike search on name/description/location.
create extension if not exists pg_trgm with schema extensions;


-- ---------------------------------------------------------------------
-- New columns on groups
-- ---------------------------------------------------------------------
create type public.group_visibility as enum ('invite_only', 'public');

alter table public.groups
  add column visibility public.group_visibility not null default 'invite_only',
  add column description text,
  add column location text,
  add column tags text[] not null default '{}',
  add column member_count integer not null default 0;

alter table public.groups
  add constraint groups_description_length
    check (description is null or length(description) <= 500),
  add constraint groups_location_length
    check (location is null or length(location) <= 120),
  add constraint groups_tags_count
    check (cardinality(tags) <= 8);

comment on column public.groups.visibility is
  'public = metadata discoverable to any authed user; invite_only = members only.';
comment on column public.groups.member_count is
  'Denormalized count of group_members, trigger-maintained (member list stays members-only).';


-- ---------------------------------------------------------------------
-- Normalize description / location / tags on write
-- ---------------------------------------------------------------------
-- Trims description/location (empty → null), and lowercases + trims +
-- dedupes tags, enforcing per-tag length (the count is also CHECKed).
-- Validation (zod) normalizes client-side too; this is the DB backstop.
create or replace function public.normalize_group_fields()
returns trigger
language plpgsql
as $$
declare
  t text;
  v text;
  cleaned text[] := '{}';
begin
  new.description := nullif(btrim(new.description), '');
  new.location := nullif(btrim(new.location), '');

  if new.tags is not null then
    foreach t in array new.tags loop
      v := lower(btrim(t));
      if length(v) = 0 then
        continue;
      end if;
      if length(v) > 30 then
        raise exception 'tag too long (max 30 characters): %', v
          using errcode = 'check_violation';
      end if;
      if not (v = any (cleaned)) then
        cleaned := array_append(cleaned, v);
      end if;
    end loop;
  end if;
  new.tags := cleaned;

  return new;
end;
$$;

create trigger groups_normalize_fields
  before insert or update of description, location, tags on public.groups
  for each row execute function public.normalize_group_fields();


-- ---------------------------------------------------------------------
-- Maintain member_count
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: a member leaving issues a DELETE on group_members
-- that must decrement groups.member_count, but members can't UPDATE
-- groups (admin-only). The definer bypasses that — it only touches the
-- counter. A cascade group-delete updates an about-to-vanish row (or
-- none): harmless either way.
create or replace function public.sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.groups
      set member_count = member_count + 1
      where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update public.groups
      set member_count = greatest(member_count - 1, 0)
      where id = old.group_id;
  end if;
  return null;
end;
$$;

create trigger group_members_count_insert
  after insert on public.group_members
  for each row execute function public.sync_group_member_count();

create trigger group_members_count_delete
  after delete on public.group_members
  for each row execute function public.sync_group_member_count();

-- Backfill existing groups.
update public.groups g
  set member_count = (
    select count(*) from public.group_members m where m.group_id = g.id
  );


-- ---------------------------------------------------------------------
-- Indexes for discovery
-- ---------------------------------------------------------------------
create index groups_visibility_idx on public.groups (visibility);
create index groups_tags_gin on public.groups using gin (tags);
create index groups_name_trgm
  on public.groups using gin (name extensions.gin_trgm_ops);
create index groups_description_trgm
  on public.groups using gin (description extensions.gin_trgm_ops);
create index groups_location_trgm
  on public.groups using gin (location extensions.gin_trgm_ops);


-- ---------------------------------------------------------------------
-- Widen the groups SELECT policy: member OR public
-- ---------------------------------------------------------------------
-- NOTE: only the groups row becomes visible. ideas/group_members/
-- decisions/group_invites keep their is_group_member() policies, so a
-- non-member discovering a public group sees metadata but no contents.
drop policy if exists groups_select_member on public.groups;

create policy groups_select_member_or_public
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id) or visibility = 'public');


-- ---------------------------------------------------------------------
-- Extend create_group with the new optional fields
-- ---------------------------------------------------------------------
drop function if exists public.create_group(text);

create function public.create_group(
  p_name text,
  p_description text default null,
  p_location text default null,
  p_tags text[] default '{}',
  p_visibility public.group_visibility default 'invite_only'
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_group public.groups;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.groups (name, created_by, description, location, tags, visibility)
  values (
    p_name,
    v_user,
    p_description,
    p_location,
    coalesce(p_tags, '{}'),
    coalesce(p_visibility, 'invite_only')
  )
  returning * into v_group;

  return v_group;
end;
$$;

revoke execute on function
  public.create_group(text, text, text, text[], public.group_visibility)
  from public, anon;
grant execute on function
  public.create_group(text, text, text, text[], public.group_visibility)
  to authenticated;


-- =====================================================================
-- Join requests
-- =====================================================================
create type public.join_request_status as enum ('pending', 'approved', 'rejected');

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.join_request_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  constraint gjr_message_length check (message is null or length(message) <= 300)
);

comment on table public.group_join_requests is
  'Requests from non-members to join a public group; admins approve/reject.';

-- At most one PENDING request per (group, user). A rejected/approved
-- request does not block a future re-request.
create unique index group_join_requests_one_pending
  on public.group_join_requests (group_id, user_id)
  where status = 'pending';

create index group_join_requests_group_status_idx
  on public.group_join_requests (group_id, status);
create index group_join_requests_user_idx
  on public.group_join_requests (user_id);


alter table public.group_join_requests enable row level security;

-- SELECT: a requester sees their own requests; admins see their group's.
create policy gjr_select
  on public.group_join_requests
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id)
  );

-- DELETE: a requester may withdraw their own still-pending request.
create policy gjr_delete_own_pending
  on public.group_join_requests
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- INSERT / UPDATE: no client policy. Mutations flow only through the
-- request_to_join / respond_to_join_request SECURITY DEFINER RPCs
-- (mirrors the invite/accept model — D48).


-- ---------------------------------------------------------------------
-- request_to_join(group_id, message?)
-- ---------------------------------------------------------------------
-- Files a pending request for a PUBLIC group. Custom SQLSTATEs extend
-- the invite contract:
--   HD004  caller is already a member
--   HD005  group is not public (or does not exist — don't leak which)
--   HD006  caller already has a pending request
create or replace function public.request_to_join(p_group_id uuid, p_message text default null)
returns public.group_join_requests
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_group public.groups;
  v_req public.group_join_requests;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.visibility <> 'public' then
    raise exception 'group is not open to join requests' using errcode = 'HD005';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_user
  ) then
    raise exception 'already a member of this group' using errcode = 'HD004';
  end if;

  if exists (
    select 1 from public.group_join_requests
    where group_id = p_group_id and user_id = v_user and status = 'pending'
  ) then
    raise exception 'join request already pending' using errcode = 'HD006';
  end if;

  insert into public.group_join_requests (group_id, user_id, message)
  values (p_group_id, v_user, nullif(btrim(p_message), ''))
  returning * into v_req;

  return v_req;
end;
$$;

revoke execute on function public.request_to_join(uuid, text) from public, anon;
grant execute on function public.request_to_join(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- respond_to_join_request(request_id, approve)
-- ---------------------------------------------------------------------
-- Admin-only. Approve → insert membership (idempotent) + mark approved.
-- Reject → mark rejected. Reuses HD000 (not found) / HD002 (already
-- handled). Non-admins get 42501.
create or replace function public.respond_to_join_request(p_request_id uuid, p_approve boolean)
returns public.group_join_requests
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_req public.group_join_requests;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_req
  from public.group_join_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'join request not found' using errcode = 'HD000';
  end if;

  if not public.is_group_admin(v_req.group_id) then
    raise exception 'only group admins can respond to join requests'
      using errcode = '42501';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'join request already handled' using errcode = 'HD002';
  end if;

  if p_approve then
    insert into public.group_members (group_id, user_id, role)
    values (v_req.group_id, v_req.user_id, 'member')
    on conflict (group_id, user_id) do nothing;

    update public.group_join_requests
      set status = 'approved', decided_at = now(), decided_by = v_user
      where id = p_request_id
      returning * into v_req;
  else
    update public.group_join_requests
      set status = 'rejected', decided_at = now(), decided_by = v_user
      where id = p_request_id
      returning * into v_req;
  end if;

  return v_req;
end;
$$;

revoke execute on function public.respond_to_join_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_join_request(uuid, boolean) to authenticated;


-- Explicit grants (CI determinism — migration 023 rationale). RLS is
-- still the boundary; these mirror Supabase defaults.
grant all on public.group_join_requests to anon, authenticated, service_role;
