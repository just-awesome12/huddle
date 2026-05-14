-- =====================================================================
-- 008 — Finalize groups RLS now that membership exists
-- =====================================================================
-- Phase 1.2 shipped provisional RLS that only granted access to the
-- creator. Now that group_members exists, replace those policies with
-- membership-aware versions:
--
--   - SELECT: any member of the group can read.
--   - UPDATE: any admin of the group can update.
--   - DELETE: any admin of the group can delete.
--   - INSERT: unchanged (creator must equal auth.uid()).
-- =====================================================================


-- Drop the provisional Phase 1.2 policies.
drop policy if exists groups_select_creator on public.groups;
drop policy if exists groups_update_creator on public.groups;
drop policy if exists groups_delete_creator on public.groups;


-- ---------------------------------------------------------------------
-- New SELECT policy: any member sees the group.
-- ---------------------------------------------------------------------
create policy groups_select_member
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));


-- ---------------------------------------------------------------------
-- New UPDATE policy: any admin can update the group.
-- ---------------------------------------------------------------------
create policy groups_update_admin
  on public.groups
  for update
  to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));


-- ---------------------------------------------------------------------
-- New DELETE policy: any admin can delete the group.
-- ---------------------------------------------------------------------
create policy groups_delete_admin
  on public.groups
  for delete
  to authenticated
  using (public.is_group_admin(id));
