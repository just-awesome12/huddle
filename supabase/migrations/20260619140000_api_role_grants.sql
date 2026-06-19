-- =====================================================================
-- 023 — explicit API-role grants (CI determinism)
-- =====================================================================
-- A from-scratch database (CI) doesn't reliably carry the table-level
-- privileges that Supabase's default-privilege setup gives `anon` /
-- `authenticated` on a long-lived local stack. Our earlier migrations
-- only granted function EXECUTE and leaned on those defaults, so pgTAP
-- on a clean DB failed with "permission denied for table ..." for every
-- table (Phase 1 tables included).
--
-- Grant the standard public-schema privileges explicitly so any fresh
-- database matches local. This mirrors Supabase's own defaults and does
-- NOT widen access: Row-Level Security is the real boundary — every
-- public table has RLS enabled with policies, so these grants are
-- necessary-but-not-sufficient (e.g. anon has SELECT privilege but RLS
-- still returns zero rows for non-members).

-- Tables + sequences only. Functions are deliberately NOT granted here:
-- each function carries its own explicit EXECUTE grant (e.g. create_group
-- is granted to `authenticated` only, D45), and a blanket routine grant
-- would hand `anon` execute on those — breaking the access model the
-- pgTAP suite enforces.

grant usage on schema public to anon, authenticated, service_role;

-- Existing tables + sequences.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Future tables/sequences created by the migration role inherit the same.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
