-- =====================================================================
-- 001 — Initial extensions
-- =====================================================================
-- pgcrypto provides gen_random_uuid() (and other crypto primitives).
-- It is enabled in the `extensions` schema per Supabase convention,
-- keeping the public schema free of vendor objects.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
