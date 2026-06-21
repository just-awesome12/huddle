-- =====================================================================
-- web push subscriptions test suite (Phase 15)
-- =====================================================================
-- Coverage: structure; own-row SELECT/INSERT; cross-user isolation;
-- forging another user's row is rejected.
-- =====================================================================

begin;

select plan(7);

select has_table('public', 'web_push_subscriptions', 'web_push_subscriptions table exists');
select columns_are(
  'public', 'web_push_subscriptions',
  array['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'last_seen_at', 'created_at'],
  'web_push_subscriptions has the expected columns'
);

-- ---------------------------------------------------------------------
-- Seed Alice + Bob
-- ---------------------------------------------------------------------
set local role postgres;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'alice@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbb1-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'bob@example.com', crypt('p', gen_salt('bf')),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- ---------------------------------------------------------------------
-- Alice registers her own subscription
-- ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub": "aaaaaaa1-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth)
values ('aaaaaaa1-0000-0000-0000-000000000001',
        'https://push.example/endpoint/alice', 'p256dh-alice', 'auth-alice');
select pass('a user can register their own web push subscription');

select isnt_empty(
  $$select 1 from public.web_push_subscriptions where endpoint = 'https://push.example/endpoint/alice'$$,
  'a user can read their own subscription'
);

-- Forging Bob's row is rejected by WITH CHECK.
select throws_ok(
  $$insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('bbbbbbb1-0000-0000-0000-000000000002',
            'https://push.example/endpoint/forged', 'x', 'y')$$,
  '42501', null,
  'a user cannot register a subscription for another user'
);

-- ---------------------------------------------------------------------
-- Bob cannot see Alice's subscription
-- ---------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub": "bbbbbbb1-0000-0000-0000-000000000002", "role": "authenticated"}';
select is_empty(
  $$select 1 from public.web_push_subscriptions where endpoint = 'https://push.example/endpoint/alice'$$,
  'a user cannot read another user''s subscription'
);

-- ---------------------------------------------------------------------
-- service_role (send-push) reads across users
-- ---------------------------------------------------------------------
set local role service_role;
select isnt_empty(
  $$select 1 from public.web_push_subscriptions where endpoint = 'https://push.example/endpoint/alice'$$,
  'service_role can read subscriptions for fan-out'
);

select * from finish();
rollback;
