-- =====================================================================
-- 031 — web push subscriptions (Phase 15 — web push)
-- =====================================================================
-- Phase 8 push is Expo/mobile-only (push_tokens). The user panel's #1
-- gap was "no web push → the app goes quiet on desktop." This adds the
-- web side: a W3C Push API subscription per browser ({endpoint, keys}),
-- stored per user. send-push dispatches to these via VAPID alongside the
-- Expo path (same recipient-selection logic, second delivery channel).
--
-- RLS mirrors push_tokens (own-row); send-push reads as service_role.
-- The endpoint is globally unique (one browser = one endpoint), so a
-- re-subscribe upserts (rotated keys) rather than duplicating.
-- =====================================================================

create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint web_push_endpoint_length check (length(endpoint) between 10 and 1024)
);

create index web_push_subscriptions_user_id_idx on public.web_push_subscriptions (user_id);

comment on table public.web_push_subscriptions is
  'W3C Web Push subscriptions per browser; the web counterpart to push_tokens. send-push delivers via VAPID. RLS own-row; service_role reads for fan-out.';

-- ---------------------------------------------------------------------
-- Row-Level Security (own-row, mirrors push_tokens)
-- ---------------------------------------------------------------------
alter table public.web_push_subscriptions enable row level security;

create policy web_push_select_own
  on public.web_push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy web_push_insert_own
  on public.web_push_subscriptions
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy web_push_update_own
  on public.web_push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy web_push_delete_own
  on public.web_push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (CI determinism — migration 023 rationale). RLS is the boundary.
grant all on public.web_push_subscriptions to anon, authenticated, service_role;
