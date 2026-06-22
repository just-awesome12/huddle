-- =====================================================================
-- 036 — pinned wall posts / announcements (Phase 15, slice 15e)
-- =====================================================================
-- The panel (esp. the 45-member club + the family) wanted a way to keep
-- one message — "Trip is ON for the 14th!" — at the top of the wall
-- instead of letting it scroll away. group_posts gets a `pinned` flag;
-- the wall sorts pinned-first.
--
-- group_posts has no UPDATE policy (posts are immutable, D88). Rather than
-- open one (which would also allow body edits), pinning goes through a
-- SECURITY DEFINER RPC that does its own admin check — only admins pin,
-- and the body stays immutable. The UPDATE rides the existing per-group
-- realtime channel (REPLICA IDENTITY FULL, migration 014).
-- =====================================================================

alter table public.group_posts
  add column pinned boolean not null default false;

-- Pinned-first ordering for the wall.
create index group_posts_pinned_idx
  on public.group_posts (group_id, pinned desc, created_at desc);

-- Admin-only pin/unpin. SECURITY DEFINER bypasses the (intentionally
-- absent) UPDATE policy; the explicit is_group_admin check — which reads
-- the caller's auth.uid() even under SECURITY DEFINER — is the gate.
create or replace function public.set_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id from public.group_posts where id = p_post_id;
  if v_group_id is null then
    raise exception 'post not found' using errcode = 'HD002';
  end if;
  if not public.is_group_admin(v_group_id) then
    raise exception 'only group admins can pin posts' using errcode = '42501';
  end if;
  update public.group_posts set pinned = p_pinned where id = p_post_id;
end;
$$;

revoke all on function public.set_post_pinned(uuid, boolean) from public;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;

comment on function public.set_post_pinned is
  'Admin-only pin/unpin of a wall post (15e). SECURITY DEFINER + is_group_admin gate; body stays immutable (no UPDATE policy).';
