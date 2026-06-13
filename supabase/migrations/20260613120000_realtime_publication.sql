-- =====================================================================
-- 014 — Realtime publication membership
-- =====================================================================
-- Phase 6. Add the tables whose changes members should see live to the
-- `supabase_realtime` publication. Without this, Postgres Changes emits
-- nothing for these tables.
--
--   groups          — renames, deletes (so a viewer's list/detail updates)
--   group_members   — joins (new member appears) and removals (a removed
--                     member's client can react; admins see the roster move)
--   ideas           — the core live surface: new ideas, status changes,
--                     edits, deletes within a group
--   decisions       — picker outcomes (Phase 7) show up in history live
--
-- SECURITY NOTE (R-4): being in the publication is necessary but NOT a
-- license to broadcast indiscriminately. Whether a subscriber receives
-- a given row's change is governed by Realtime's RLS enforcement on
-- Postgres Changes, which runs the table's SELECT policy as the
-- subscribing user. Every table here already has a member-scoped SELECT
-- policy from Phase 1. The accompanying integration test
-- (packages/api-client/tests/realtime-rls.integration) verifies
-- empirically that a non-member receives nothing — do not assume.
--
-- `REPLICA IDENTITY FULL` makes the OLD row available in DELETE/UPDATE
-- payloads. We need it so a DELETE event still carries enough columns
-- (notably group_id) for clients to route the invalidation to the right
-- query, and so Realtime can evaluate the SELECT policy against the old
-- row on DELETE.
-- =====================================================================

alter table public.groups        replica identity full;
alter table public.group_members replica identity full;
alter table public.ideas         replica identity full;
alter table public.decisions     replica identity full;

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.decisions;
