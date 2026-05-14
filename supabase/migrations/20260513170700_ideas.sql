-- =====================================================================
-- 009 — ideas table
-- =====================================================================
-- The core content of Huddle: an idea proposed by a group member.
--
-- Access model (intentionally simple — see decision log entry):
--   - SELECT: any member of the group.
--   - INSERT: any member; proposed_by must equal auth.uid().
--   - UPDATE: any member (any field). This includes title edits,
--     status changes, etc. The trust boundary is the group: members
--     are presumed to behave reasonably toward each other's content.
--   - DELETE: the proposer or a group admin only.
--
-- Categories and status are Postgres enums so misbehaving clients
-- cannot bypass them.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.idea_category as enum
  ('food', 'activity', 'place', 'event', 'other');

create type public.idea_status as enum
  ('on_radar', 'done', 'dismissed');


-- ---------------------------------------------------------------------
-- ideas table
-- ---------------------------------------------------------------------
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category public.idea_category not null,
  link text,
  photo_path text,
  status public.idea_status not null default 'on_radar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ideas_title_length check (length(trim(title)) between 1 and 200),
  constraint ideas_description_length check (
    description is null or length(description) <= 4000
  ),
  constraint ideas_link_length check (
    link is null or length(link) <= 2048
  ),
  -- photo_path stores the object key inside the idea-photos bucket.
  -- Format: {group_id}/{idea_id}/{filename}. Bucket RLS uses this
  -- structure to authorize access.
  constraint ideas_photo_path_length check (
    photo_path is null or length(photo_path) <= 512
  )
);

comment on table public.ideas is
  'Ideas proposed within a group. Status flows on_radar -> done | dismissed.';

create index ideas_group_id_idx on public.ideas (group_id);
create index ideas_group_id_status_idx on public.ideas (group_id, status);
create index ideas_proposed_by_idx on public.ideas (proposed_by);


-- ---------------------------------------------------------------------
-- Trigger: trim title
-- ---------------------------------------------------------------------
create or replace function public.trim_idea_title()
returns trigger
language plpgsql
as $$
begin
  new.title := trim(new.title);
  return new;
end;
$$;

create trigger ideas_trim_title
  before insert or update of title on public.ideas
  for each row execute function public.trim_idea_title();


-- ---------------------------------------------------------------------
-- Trigger: updated_at maintenance
-- ---------------------------------------------------------------------
create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.ideas enable row level security;

-- SELECT: any member of the parent group.
create policy ideas_select_member
  on public.ideas
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- INSERT: must be a member of the group AND must set proposed_by to
-- their own auth.uid().
create policy ideas_insert_member
  on public.ideas
  for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and proposed_by = (select auth.uid())
  );

-- UPDATE: any member of the group can update any field on an idea.
-- The WITH CHECK prevents a member from "moving" an idea to a group
-- they aren't in, or reassigning the proposer.
create policy ideas_update_member
  on public.ideas
  for update
  to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- DELETE: proposer or admin only.
create policy ideas_delete_proposer_or_admin
  on public.ideas
  for delete
  to authenticated
  using (
    proposed_by = (select auth.uid())
    or public.is_group_admin(group_id)
  );
