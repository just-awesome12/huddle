-- =====================================================================
-- Lite mode (Phase 16, slice 16d) — a per-group "small group" flag.
-- =====================================================================
-- Couples / roommates don't need the crowd-coordination surface (polls,
-- activity feed, do-again / reignite nudges, presence). An admin flips
-- this flag in group settings; the apps render a trimmed hub when it's on.
--
-- No new RLS: the existing admin-only groups UPDATE policy
-- (groups_update_admin → is_group_admin, migration 20260513170600) already
-- gates who can toggle it, and the table-level grants (migration 023)
-- cover the new column. groups is already in the realtime publication
-- (migration 014, REPLICA IDENTITY FULL), so the toggle rides the existing
-- per-group channel — no publication change.
-- =====================================================================

alter table public.groups
  add column lite_mode boolean not null default false;

comment on column public.groups.lite_mode is
  'When true, apps render a simplified hub (no polls / feed / nudges) for small groups. Admin-toggled. (Phase 16d)';
