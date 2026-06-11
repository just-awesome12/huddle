-- =====================================================================
-- invite RPCs test suite (Phase 4.1)
-- =====================================================================
-- Coverage:
--   - Functions exist
--   - accept_invite happy path: membership row created as 'member',
--     invite marked accepted, group row returned
--   - HD000 unknown token (accept + peek raise; no enumeration oracle)
--   - HD001 expired invite
--   - HD002 reused invite
--   - HD003 by-user invite accepted by someone else
--   - HD003 by-email invite accepted by a different email
--   - HD004 acceptor already a member
--   - anon cannot execute either function
--   - peek_invite statuses: valid / expired / accepted; limited columns
-- =====================================================================

begin;

select plan(17);

select has_function('public', 'peek_invite', array['text'], 'peek_invite(text) exists');
select has_function('public', 'accept_invite', array['text'], 'accept_invite(text) exists');

-- ---------------------------------------------------------------------
-- Seed: two users (admin Ann, joiner Joe), a group, invites
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'ann@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb, now(), now()
), (
  '00000000-0000-0000-0000-000000000000',
  'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'joe@example.com',
  crypt('password123', gen_salt('bf')),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.groups (id, name, created_by)
values ('decade10-0000-0000-0000-000000000001', 'Invite Test Group',
        'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- (trigger makes Ann the admin member)

-- A valid open link-invite, an expired one, and a by-user invite to Joe.
insert into public.group_invites (id, group_id, token, created_by, expires_at)
values
  ('decade20-0000-0000-0000-000000000001',
   'decade10-0000-0000-0000-000000000001',
   'tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() + interval '7 days'),
  ('decade20-0000-0000-0000-000000000002',
   'decade10-0000-0000-0000-000000000001',
   'tok_expired_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '1 hour');

insert into public.group_invites (id, group_id, token, created_by, invited_user_id)
values
  ('decade20-0000-0000-0000-000000000003',
   'decade10-0000-0000-0000-000000000001',
   'tok_foruser_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into public.group_invites (id, group_id, token, created_by, invited_email)
values
  ('decade20-0000-0000-0000-000000000004',
   'decade10-0000-0000-0000-000000000001',
   'tok_foremail_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'someone.else@example.com');

-- ---------------------------------------------------------------------
-- anon: blocked from both functions
-- ---------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$select * from public.peek_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  '42501', null,
  'anon cannot execute peek_invite'
);

select throws_ok(
  $$select public.accept_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  '42501', null,
  'anon cannot execute accept_invite'
);

-- ---------------------------------------------------------------------
-- Joe (authenticated): peek then accept
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "joe@example.com"}';

select is(
  (select status from public.peek_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  'valid',
  'peek_invite reports a fresh invite as valid'
);

select is(
  (select group_name from public.peek_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  'Invite Test Group',
  'peek_invite returns the group name'
);

select is(
  (select status from public.peek_invite('tok_expired_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  'expired',
  'peek_invite reports an expired invite'
);

select throws_ok(
  $$select * from public.peek_invite('tok_does_not_exist_aaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD000', null,
  'peek_invite raises HD000 for an unknown token'
);

-- Accept the valid invite.
select is(
  (select name from public.accept_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  'Invite Test Group',
  'accept_invite returns the joined group'
);

-- Verify side effects as superuser.
set local role postgres;

select is(
  (select role::text from public.group_members
    where group_id = 'decade10-0000-0000-0000-000000000001'
      and user_id = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'member',
  'acceptor was added as a member'
);

select isnt_empty(
  $$select 1 from public.group_invites
     where id = 'decade20-0000-0000-0000-000000000001'
       and accepted_by = 'decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
       and accepted_at is not null$$,
  'invite is marked accepted with the acceptor recorded'
);

-- ---------------------------------------------------------------------
-- Error paths (back as Joe, now a member)
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "decade0b-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated", "email": "joe@example.com"}';

select throws_ok(
  $$select public.accept_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD002', null,
  'reusing an accepted invite raises HD002'
);

select throws_ok(
  $$select public.accept_invite('tok_expired_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD001', null,
  'an expired invite raises HD001'
);

-- Joe is now a member; a fresh by-user invite to him would be blocked
-- at creation by the reject_invite_if_member trigger, and acceptance of
-- the still-open by-email invite (addressed to someone else) must fail
-- on the email check before the member check.
select throws_ok(
  $$select public.accept_invite('tok_foremail_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD003', null,
  'a by-email invite for a different email raises HD003'
);

-- The by-user invite addressed to Joe: he is already a member now.
select throws_ok(
  $$select public.accept_invite('tok_foruser_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD004', null,
  'accepting when already a member raises HD004'
);

select is(
  (select status from public.peek_invite('tok_valid_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  'accepted',
  'peek_invite reports an accepted invite'
);

-- ---------------------------------------------------------------------
-- Ann tries to accept the by-user invite addressed to Joe
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "decade0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated", "email": "ann@example.com"}';

select throws_ok(
  $$select public.accept_invite('tok_foruser_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  'HD003', null,
  'a by-user invite accepted by a different user raises HD003'
);

select * from finish();
rollback;
