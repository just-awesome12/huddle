-- =====================================================================
-- 012 — create_group RPC
-- =====================================================================
-- Phase 3.2 found a chicken-and-egg in group creation:
--
--   INSERT INTO groups ... RETURNING *  (PostgREST insert().select())
--
-- fails with 42501, because the RETURNING clause is checked against
-- the groups SELECT policy (is_group_member) BEFORE the after-insert
-- trigger has added the creator to group_members. A plain INSERT
-- (returning=minimal) works, but the client then has no way to get
-- the new group's id without generating UUIDs client-side — which
-- needs a crypto polyfill on React Native.
--
-- Fix: a SECURITY DEFINER function that inserts and returns the row,
-- bypassing the RETURNING visibility check. Forgery is impossible:
-- the function takes only the name and always uses auth.uid() as the
-- creator — stronger than the table's WITH CHECK, which at least
-- nominally accepts a caller-supplied created_by.
--
-- The groups INSERT policy stays in place (harmless, and direct
-- inserts without RETURNING remain legal). The handle_new_group
-- trigger fires inside the function's INSERT exactly as before.
-- =====================================================================

create or replace function public.create_group(p_name text)
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
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  -- The groups_name_length CHECK and trim trigger still apply.
  insert into public.groups (name, created_by)
  values (p_name, v_user)
  returning * into v_group;

  return v_group;
end;
$$;

revoke execute on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
