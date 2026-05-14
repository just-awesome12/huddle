-- =====================================================================
-- 002 — profiles table
-- =====================================================================
-- 1:1 with auth.users. Holds public-facing identity (username, display
-- name, avatar). The username is the user-chosen handle visible to
-- other members; display_name is the friendly label shown in UI.
--
-- Decisions confirmed for Huddle (see docs/ARCHITECTURE.md):
--   - Username: 3-30 chars, [a-z0-9_] only, lowercased on insert.
--   - Profile rows are created automatically on auth.users insert via
--     a SECURITY DEFINER trigger, with a placeholder username derived
--     from the user's UUID. The user is expected to change it in
--     onboarding (Phase 2).
--   - Profiles are READABLE by any authenticated user (usernames are
--     public by design — they appear next to ideas and group members).
--     They are UPDATABLE only by the owner.
--   - INSERT and DELETE are denied for all roles; the trigger handles
--     creation, and deletion cascades from auth.users.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper: username validation (used in CHECK constraint)
-- ---------------------------------------------------------------------
create or replace function public.is_valid_username(value text)
returns boolean
language sql
immutable
parallel safe
as $$
  select value ~ '^[a-z0-9_]{3,30}$';
$$;


-- ---------------------------------------------------------------------
-- Helper: set updated_at automatically (reused by other tables later)
-- ---------------------------------------------------------------------
-- IMPORTANT: uses clock_timestamp() rather than now() / CURRENT_TIMESTAMP.
-- now() returns the transaction-start time and is identical for every
-- call within a single transaction. If two columns are updated in the
-- same request, both would land with identical updated_at, defeating
-- the point. clock_timestamp() returns the actual wall-clock time and
-- advances between calls.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (public.is_valid_username(username)),
  display_name text not null check (length(display_name) between 1 and 60),
  avatar_url text check (avatar_url is null or length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  '1:1 with auth.users. Public-facing identity for Huddle members.';


-- ---------------------------------------------------------------------
-- Trigger: lowercase usernames on insert/update
-- (Belt-and-suspenders alongside the CHECK constraint, so callers who
-- pass mixed-case usernames get normalized instead of rejected.)
-- ---------------------------------------------------------------------
create or replace function public.lowercase_username()
returns trigger
language plpgsql
as $$
begin
  new.username := lower(new.username);
  return new;
end;
$$;

create trigger profiles_lowercase_username
  before insert or update of username on public.profiles
  for each row execute function public.lowercase_username();


-- ---------------------------------------------------------------------
-- Trigger: updated_at maintenance
-- ---------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Trigger: auto-create a profile when an auth.users row is created.
--
-- Runs with SECURITY DEFINER so it bypasses RLS. The placeholder
-- username is derived from the user's UUID (first 12 hex chars) so it
-- is guaranteed to match our regex and astronomically unlikely to
-- collide. The user is expected to set a real username in onboarding.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  placeholder text;
begin
  placeholder := 'u_' || substr(replace(new.id::text, '-', ''), 1, 12);

  insert into public.profiles (id, username, display_name)
  values (new.id, placeholder, placeholder);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

-- READ: any authenticated user can read any profile.
-- Usernames are public-by-design: they appear next to every idea
-- and in member lists. Restricting reads would require N+1 lookups
-- of "do we share a group" for every UI render.
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (true);

-- UPDATE: a user can update only their own profile.
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- INSERT and DELETE: no policies defined → operations are denied for
-- all non-superuser roles. The handle_new_user() trigger is SECURITY
-- DEFINER so it bypasses RLS. Deletion happens via auth.users cascade.
