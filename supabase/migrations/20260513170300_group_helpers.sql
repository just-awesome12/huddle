-- =====================================================================
-- 005 — Group membership helper functions
-- =====================================================================
-- These functions exist so RLS policies on every group-scoped table
-- (groups, group_invites, ideas, decisions) can ask the same two
-- questions in one place: "is this user a member of this group?" and
-- "is this user an ADMIN of this group?".
--
-- Both functions are:
--   - SECURITY DEFINER: they read from public.group_members on behalf
--     of the policy, bypassing the group_members RLS. This is safe
--     because the functions only return a boolean — they don't expose
--     any rows or columns to the caller. They never trust the
--     caller's claims; they always check against auth.uid().
--   - STABLE: their result depends only on the database state, not on
--     arguments outside the row. The query planner can cache calls
--     within a single statement, making membership checks cheap even
--     when a policy applies them across thousands of rows.
--   - language plpgsql (not sql): plpgsql function bodies are parsed
--     but their object references are resolved at first call. This
--     lets us create the helpers BEFORE group_members exists; the
--     table will be created in migration 006 in the same transaction
--     sequence. A `language sql` function would fail here because
--     SQL function bodies are validated at CREATE time.
-- =====================================================================


-- ---------------------------------------------------------------------
-- is_group_member(group_id)
-- Returns true if the currently authenticated user is in group_members
-- for the given group_id (with any role).
-- ---------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
end;
$$;


-- ---------------------------------------------------------------------
-- is_group_admin(group_id)
-- Returns true only if the user's role in the group is 'admin'.
-- ---------------------------------------------------------------------
create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
      and role = 'admin'
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Permissions: these helpers are called from RLS policies that run
-- under the `authenticated` role (and rarely `anon`). Grant EXECUTE
-- to both. The functions still always check auth.uid() internally.
-- ---------------------------------------------------------------------
grant execute on function public.is_group_member(uuid) to authenticated, anon;
grant execute on function public.is_group_admin(uuid) to authenticated, anon;
