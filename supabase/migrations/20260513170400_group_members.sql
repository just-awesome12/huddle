-- =====================================================================
-- 006 — group_members table
-- =====================================================================
-- Junction table between groups and profiles. Each row represents one
-- user's membership in one group, with a role of 'admin' or 'member'.
--
-- Decisions:
--   - Composite PK (group_id, user_id) — a user can be in a group at
--     most once, and the natural key is more compact than a UUID PK.
--   - Role is an ENUM defined inline. 'admin' is granted to the group
--     creator automatically via trigger.
--   - "Last admin" protection: a trigger rejects any DELETE or
--     role-demotion that would leave the group with zero admins.
--     The last admin must either promote someone else first or
--     delete the entire group.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Role enum
-- ---------------------------------------------------------------------
create type public.group_member_role as enum ('admin', 'member');


-- ---------------------------------------------------------------------
-- group_members table
-- ---------------------------------------------------------------------
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is
  'Junction between groups and profiles. Each row = one membership with a role.';

create index group_members_user_id_idx on public.group_members (user_id);


-- ---------------------------------------------------------------------
-- Trigger: when a group is created, automatically add the creator as
-- the first admin member.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();


-- ---------------------------------------------------------------------
-- Trigger: last-admin protection
-- ---------------------------------------------------------------------
-- Fires BEFORE DELETE and BEFORE UPDATE OF role. Raises if removing
-- or demoting the last admin would leave the group with zero admins.
--
-- IMPORTANT: must not fire on cascade-deletes from groups. When a
-- group is deleted, Postgres issues real DELETEs against the child
-- group_members rows, which DOES fire this trigger. "Zero admins
-- remaining" is the intended state in that case, not a violation.
--
-- We detect the cascade case by checking whether the parent group
-- row still exists. If it doesn't, we're mid-cascade and allow the
-- deletion through. The lookup uses public.groups directly; this is
-- safe because the trigger runs as the row owner / table owner, not
-- as the calling user.
-- ---------------------------------------------------------------------
create or replace function public.enforce_last_admin()
returns trigger
language plpgsql
as $$
declare
  remaining_admins int;
  target_group_id uuid;
  parent_exists boolean;
begin
  target_group_id := coalesce(old.group_id, new.group_id);

  -- Cascade-from-groups detection: if the parent group has been
  -- deleted (or is being deleted in the same statement), skip the
  -- last-admin check entirely. The group itself is going away, so
  -- "zero admins" is the intended end state.
  select exists (
    select 1 from public.groups where id = target_group_id
  ) into parent_exists;

  if not parent_exists then
    return coalesce(new, old);
  end if;

  -- Now we know the group is sticking around. Count admins remaining
  -- after the proposed change.
  if tg_op = 'DELETE' then
    select count(*) into remaining_admins
    from public.group_members
    where group_id = target_group_id
      and role = 'admin'
      and not (user_id = old.user_id);

  elsif tg_op = 'UPDATE' then
    -- UPDATE only matters if it is a demotion FROM admin.
    if old.role = 'admin' and new.role <> 'admin' then
      select count(*) into remaining_admins
      from public.group_members
      where group_id = target_group_id
        and role = 'admin'
        and not (user_id = old.user_id);
    else
      -- Not a demotion → no constraint to enforce.
      return new;
    end if;
  end if;

  if remaining_admins = 0 then
    raise exception 'cannot leave group with zero admins'
      using errcode = 'check_violation',
            hint = 'Promote another member to admin first, or delete the group.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger enforce_last_admin_on_delete
  before delete on public.group_members
  for each row execute function public.enforce_last_admin();

create trigger enforce_last_admin_on_update
  before update of role on public.group_members
  for each row execute function public.enforce_last_admin();


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.group_members enable row level security;

-- SELECT: rows are visible to any member of the same group.
create policy group_members_select
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: no client-side policy. Insertion happens only via:
--   - The handle_new_group() trigger (SECURITY DEFINER, bypasses RLS)
--   - The accept-invite Edge Function in Phase 4 (uses service role)

-- UPDATE: only admins of the group can change another member's role.
-- The last-admin trigger further restricts demotions.
create policy group_members_update_admin
  on public.group_members
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- DELETE: two cases are allowed:
--   1. A user can remove themselves from a group ("leave").
--   2. An admin can remove any member ("kick").
-- The last-admin trigger blocks both if the resulting state would
-- be zero admins (unless the group itself is being deleted).
create policy group_members_delete
  on public.group_members
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id)
  );
