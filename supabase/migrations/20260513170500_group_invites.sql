-- =====================================================================
-- 007 — group_invites table
-- =====================================================================
-- Pending invitations to a group. Each invite is one of:
--   - by-link: invited_user_id and invited_email both NULL. Anyone
--     who has the token URL can accept (subject to expiry / single-use).
--   - by-email: invited_email set. Acceptance still uses the token,
--     but the UI can surface "you have a pending invite" lookups.
--   - by-user: invited_user_id set (resolved via username search at
--     creation time). Acceptance still uses the token.
--
-- Tokens are base64url-encoded 32-byte random strings (~256 bits).
-- They are stored verbatim — see the rationale in ARCHITECTURE.md.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper: generate a base64url-encoded random token (server-side use)
-- ---------------------------------------------------------------------
-- Postgres's pgcrypto returns base64 with +, /, =. We replace into
-- base64url (-, _, no padding) so the token is URL-safe out of the box.
create or replace function public.generate_invite_token()
returns text
language sql
volatile  -- gen_random_bytes is non-deterministic; required.
parallel safe
as $$
  select translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );
$$;


-- ---------------------------------------------------------------------
-- group_invites table
-- ---------------------------------------------------------------------
create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique default public.generate_invite_token(),
  invited_email text,
  invited_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),

  -- Token format guard. We don't trust callers to honour generate_invite_token().
  constraint group_invites_token_format check (token ~ '^[A-Za-z0-9_-]{40,64}$'),

  -- Either both accepted_* fields are set, or neither. Half-set states
  -- would indicate a corrupted accept flow.
  constraint group_invites_accepted_consistency check (
    (accepted_by is null) = (accepted_at is null)
  ),

  -- Email format check (lightweight — not full RFC 5322).
  constraint group_invites_email_format check (
    invited_email is null or invited_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create index group_invites_group_id_idx on public.group_invites (group_id);
create index group_invites_invited_user_id_idx on public.group_invites (invited_user_id)
  where invited_user_id is not null;
create index group_invites_token_idx on public.group_invites (token);


-- ---------------------------------------------------------------------
-- Trigger: prevent inviting someone who is already a member.
-- Only enforceable when invited_user_id is set (we don't know the
-- user_id for email-only or by-link invites at creation time).
-- ---------------------------------------------------------------------
create or replace function public.reject_invite_if_member()
returns trigger
language plpgsql
as $$
begin
  if new.invited_user_id is not null then
    if exists (
      select 1 from public.group_members
      where group_id = new.group_id and user_id = new.invited_user_id
    ) then
      raise exception 'user is already a member of this group'
        using errcode = 'unique_violation',
              hint = 'No invite is needed.';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_invites_reject_if_member
  before insert on public.group_invites
  for each row execute function public.reject_invite_if_member();


-- ---------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------
alter table public.group_invites enable row level security;

-- SELECT: admins of the group can see all invites for their group.
-- The invited user (when invited_user_id is known) can see their
-- own pending invites — needed for "you have an invite" UI.
create policy group_invites_select
  on public.group_invites
  for select
  to authenticated
  using (
    public.is_group_admin(group_id)
    or invited_user_id = (select auth.uid())
  );

-- INSERT: only admins of the group can create invites, and the
-- created_by column must match the requester.
create policy group_invites_insert_admin
  on public.group_invites
  for insert
  to authenticated
  with check (
    public.is_group_admin(group_id)
    and created_by = (select auth.uid())
  );

-- UPDATE: clients cannot UPDATE invites directly. Accepting an invite
-- goes through an Edge Function (Phase 4) running as service_role,
-- which bypasses RLS. Revocation (Phase 4 OQ-10) will be modelled as
-- a DELETE.

-- DELETE: admins can revoke invites for their group.
create policy group_invites_delete_admin
  on public.group_invites
  for delete
  to authenticated
  using (public.is_group_admin(group_id));
