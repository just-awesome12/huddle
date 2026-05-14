-- =====================================================================
-- 011 — push_tokens table
-- =====================================================================
-- Stores Expo push notification tokens per (user, device). A user
-- can be signed in on multiple devices and will receive pushes on
-- each one until explicitly signed out.
--
-- The send-push Edge Function in Phase 8 reads from this table as
-- service_role to fan out notifications. Tokens that fail delivery
-- (Expo returns an error) get marked stale via last_seen_at being
-- advanced only on successful sends; a separate cleanup job (Phase 8
-- or post-launch) can purge tokens not seen for 30+ days.
-- =====================================================================


create type public.push_platform as enum ('ios', 'android');


create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null,
  platform public.push_platform not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- A given (user, token) is unique. The same token from the same
  -- user is idempotent. Expo tokens look like ExponentPushToken[xxx];
  -- the length cap is generous to allow for future format changes.
  constraint push_tokens_user_token_unique unique (user_id, expo_token),
  constraint push_tokens_expo_token_length check (
    length(expo_token) between 10 and 256
  )
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.push_tokens enable row level security;

-- SELECT: only the owning user. (The send-push Edge Function uses
-- service_role to read across all users.)
create policy push_tokens_select_own
  on public.push_tokens
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- INSERT: a user can register their own token.
create policy push_tokens_insert_own
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- UPDATE: a user can update their own token row (e.g., advance
-- last_seen_at). The WITH CHECK prevents reassigning user_id.
create policy push_tokens_update_own
  on public.push_tokens
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- DELETE: a user can remove their own token (e.g., on sign-out).
create policy push_tokens_delete_own
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
