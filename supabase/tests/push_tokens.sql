-- =====================================================================
-- push_tokens test suite (Phase 1.4)
-- =====================================================================
-- Coverage:
--   - Structure
--   - Unique (user_id, expo_token)
--   - RLS: anon cannot read
--   - RLS: user can read OWN tokens, not others'
--   - RLS: user can INSERT own; cannot INSERT for another user
--   - RLS: user can UPDATE own; cannot reassign user_id
--   - RLS: user can DELETE own; cannot DELETE others
--   - Cascade: deleting user removes their tokens
--
-- UUID prefix: token = feee... (valid hex)
-- =====================================================================

begin;
select plan(10);


-- ---------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------
select has_table('public', 'push_tokens', 'push_tokens table exists');


-- ---------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'decade01-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'alice@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'decade02-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bob@example.com',
   crypt('p', gen_salt('bf')), '{}'::jsonb, '{}'::jsonb, now(), now());


-- ---------------------------------------------------------------------
-- Alice registers a token
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

insert into public.push_tokens (id, user_id, expo_token, platform)
values (
  'fa571111-1111-1111-1111-111111111111',
  'decade01-1111-1111-1111-111111111111',
  'ExponentPushToken[alice-iphone-abc123xyz]',
  'ios'
);

select pass('user can register own push token');


-- ---------------------------------------------------------------------
-- Unique (user_id, expo_token)
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_token, platform)
    values ('decade01-1111-1111-1111-111111111111',
            'ExponentPushToken[alice-iphone-abc123xyz]',
            'ios')$$,
  '23505',
  null,
  'duplicate (user_id, expo_token) is rejected'
);


-- ---------------------------------------------------------------------
-- RLS: anon
-- ---------------------------------------------------------------------
set local role anon;
select is_empty(
  $$select 1 from public.push_tokens$$,
  'anon role cannot read push_tokens'
);


-- ---------------------------------------------------------------------
-- RLS: SELECT — user sees only own
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade01-1111-1111-1111-111111111111", "role": "authenticated"}';

select isnt_empty(
  $$select 1 from public.push_tokens
    where id = 'fa571111-1111-1111-1111-111111111111'$$,
  'user can read their own push token'
);

set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

select is_empty(
  $$select 1 from public.push_tokens
    where id = 'fa571111-1111-1111-1111-111111111111'$$,
  'user CANNOT read another user''s push token'
);


-- ---------------------------------------------------------------------
-- RLS: INSERT — user_id must equal auth.uid()
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_token, platform)
    values ('decade01-1111-1111-1111-111111111111',
            'ExponentPushToken[bob-forged]',
            'android')$$,
  '42501',
  null,
  'user CANNOT INSERT a push token for another user'
);


-- ---------------------------------------------------------------------
-- RLS: UPDATE — can't reassign user_id
-- ---------------------------------------------------------------------
insert into public.push_tokens (id, user_id, expo_token, platform)
values (
  'fa572222-2222-2222-2222-222222222222',
  'decade02-2222-2222-2222-222222222222',
  'ExponentPushToken[bob-pixel-xyz]',
  'android'
);

update public.push_tokens
  set user_id = 'decade02-2222-2222-2222-222222222222'
  where id = 'fa571111-1111-1111-1111-111111111111';

set local role postgres;
select is(
  (select user_id from public.push_tokens
   where id = 'fa571111-1111-1111-1111-111111111111'),
  'decade01-1111-1111-1111-111111111111'::uuid,
  'attempting to reassign another user''s token has no effect'
);


-- ---------------------------------------------------------------------
-- RLS: DELETE — only own
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "decade02-2222-2222-2222-222222222222", "role": "authenticated"}';

delete from public.push_tokens
  where id = 'fa571111-1111-1111-1111-111111111111';

set local role postgres;
select isnt_empty(
  $$select 1 from public.push_tokens
    where id = 'fa571111-1111-1111-1111-111111111111'$$,
  'user CANNOT DELETE another user''s push token'
);


-- ---------------------------------------------------------------------
-- Cascade
-- ---------------------------------------------------------------------
delete from auth.users where id = 'decade01-1111-1111-1111-111111111111';

select is_empty(
  $$select 1 from public.push_tokens
    where user_id = 'decade01-1111-1111-1111-111111111111'$$,
  'deleting a user cascades to remove their push_tokens'
);


select * from finish();
rollback;
