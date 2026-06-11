-- =====================================================================
-- 013 — invite RPCs: peek_invite + accept_invite
-- =====================================================================
-- Phase 4 invite acceptance. The acceptor is, by definition, NOT a
-- member of the group yet, so RLS blocks every step of acceptance for
-- them: they can't SELECT the invite (unless it was addressed to their
-- user id), can't INSERT into group_members, can't UPDATE the invite.
--
-- Per D48, acceptance is a SECURITY DEFINER RPC (the D45 pattern), not
-- an Edge Function as the Phase 0 roadmap assumed: a single atomic
-- transaction, pgTAP-testable, no new infra. Edge Functions debut in
-- Phase 7 where they are unavoidable (server-side picker).
--
-- Invite CREATION needs no RPC: an admin's plain INSERT passes RLS and
-- the token comes back via RETURNING (the admin already passes the
-- SELECT policy — no trigger-visibility problem like create_group had).
--
-- Error contract: invite-flow failures raise with custom 'HD###'
-- SQLSTATEs so clients can map them without parsing message text.
--   HD000  invite not found
--   HD001  invite expired
--   HD002  invite already used
--   HD003  invite addressed to another user
--   HD004  caller is already a member of the group
-- =====================================================================


-- ---------------------------------------------------------------------
-- peek_invite(token)
-- ---------------------------------------------------------------------
-- Lets ANY authenticated user with the token see what they've been
-- invited to before accepting ("You've been invited to <group> by
-- <person>"). Possession of the 256-bit token is the capability; the
-- function discloses only group name, inviter display name, expiry,
-- and a computed status — never member lists or other invite fields.
-- ---------------------------------------------------------------------
create or replace function public.peek_invite(p_token text)
returns table (
  group_id uuid,
  group_name text,
  inviter_display_name text,
  status text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_invite public.group_invites;
  v_status text;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.group_invites gi
  where gi.token = p_token;

  if not found then
    raise exception 'invite not found' using errcode = 'HD000';
  end if;

  if v_invite.accepted_at is not null then
    v_status := 'accepted';
  elsif v_invite.expires_at < now() then
    v_status := 'expired';
  elsif exists (
    select 1 from public.group_members gm
    where gm.group_id = v_invite.group_id and gm.user_id = v_user
  ) then
    v_status := 'already_member';
  elsif v_invite.invited_user_id is not null and v_invite.invited_user_id <> v_user then
    v_status := 'wrong_user';
  elsif v_invite.invited_email is not null
    and lower(v_invite.invited_email) is distinct from lower((select auth.email())) then
    v_status := 'wrong_user';
  else
    v_status := 'valid';
  end if;

  return query
    select v_invite.group_id,
           g.name,
           p.display_name,
           v_status,
           v_invite.expires_at
    from public.groups g
    join public.profiles p on p.id = v_invite.created_by
    where g.id = v_invite.group_id;
end;
$$;

revoke execute on function public.peek_invite(text) from public, anon;
grant execute on function public.peek_invite(text) to authenticated;


-- ---------------------------------------------------------------------
-- accept_invite(token)
-- ---------------------------------------------------------------------
-- Atomically: lock the invite row, validate (exists, unexpired, unused,
-- addressed to the caller if targeted, caller not already a member),
-- mark it accepted, insert the membership, and return the group row so
-- the client can navigate straight to it.
--
-- FOR UPDATE serialises concurrent accepts of the same token: the
-- second transaction blocks on the lock, then sees accepted_at set and
-- fails with HD002.
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns public.groups
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_invite public.group_invites;
  v_group public.groups;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.group_invites gi
  where gi.token = p_token
  for update;

  if not found then
    raise exception 'invite not found' using errcode = 'HD000';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite already used' using errcode = 'HD002';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = 'HD001';
  end if;

  if v_invite.invited_user_id is not null and v_invite.invited_user_id <> v_user then
    raise exception 'invite addressed to another user' using errcode = 'HD003';
  end if;

  if v_invite.invited_email is not null
    and lower(v_invite.invited_email) is distinct from lower((select auth.email())) then
    raise exception 'invite addressed to another user' using errcode = 'HD003';
  end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = v_invite.group_id and gm.user_id = v_user
  ) then
    raise exception 'already a member of this group' using errcode = 'HD004';
  end if;

  update public.group_invites
    set accepted_by = v_user, accepted_at = now()
    where id = v_invite.id;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_user, 'member');

  select * into v_group from public.groups where id = v_invite.group_id;
  return v_group;
end;
$$;

revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
