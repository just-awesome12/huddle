-- =====================================================================
-- 034 — get_push_recipients RPC (Phase 15 — send-push reliability)
-- =====================================================================
-- send-push resolved recipients with SEVERAL separate multi-row PostgREST
-- reads (group_members for membership/admins, then push_tokens +
-- web_push_subscriptions + notification_prefs + group mutes). On the
-- constrained edge runtime those multi-row responses were intermittently
-- TRUNCATED under the integration probe's rapid-fire invocations —
-- recipient counts came back low/empty, non-deterministically.
--
-- Collapse the ENTIRE gather into ONE round trip: a SECURITY DEFINER
-- function resolves the target user set (group members / admins / an
-- explicit list) AND aggregates their tokens + web subs + prefs + mutes,
-- returning everything as a single jsonb value (one row, one column —
-- nothing multi-row to truncate, no query concurrency, no separate
-- membership read). The recipient-SELECTION logic (actor exclusion, prefs,
-- mute) stays in @huddle/core, so there's no drift surface. service_role
-- only (send-push reads as it).
-- =====================================================================

drop function if exists public.get_push_recipients(uuid[], uuid);

create or replace function public.get_push_recipients(
  p_group_id uuid,
  p_scope text,
  p_explicit_user_ids uuid[]
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with target as (
    select gm.user_id
      from public.group_members gm
      where p_scope = 'members' and gm.group_id = p_group_id
    union
    select gm.user_id
      from public.group_members gm
      where p_scope = 'admins' and gm.group_id = p_group_id and gm.role = 'admin'
    union
    select u.user_id
      from unnest(coalesce(p_explicit_user_ids, '{}'::uuid[])) as u(user_id)
      where p_scope = 'explicit'
  )
  select jsonb_build_object(
    'tokens', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.user_id, 'expo_token', t.expo_token))
      from public.push_tokens t
      where t.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'subs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.web_push_subscriptions s
      where s.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'prefs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', np.user_id,
        'new_idea', np.new_idea, 'picker_ran', np.picker_ran, 'group_invite', np.group_invite,
        'new_comment', np.new_comment, 'join_request', np.join_request,
        'join_approved', np.join_approved, 'reaction', np.reaction, 'rsvp', np.rsvp))
      from public.notification_prefs np
      where np.user_id in (select user_id from target)
    ), '[]'::jsonb),
    'muted', coalesce((
      select jsonb_agg(m.user_id)
      from public.group_notification_prefs m
      where m.group_id = p_group_id and m.muted = true
        and m.user_id in (select user_id from target)
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_push_recipients(uuid, text, uuid[]) is
  'Phase 15: single-round-trip recipient gather for send-push — resolves the target set (members/admins/explicit) + their tokens, web subs, prefs, and group mutes as one jsonb, avoiding the multi-row PostgREST truncation flake. service_role only.';

-- Not user-callable; send-push invokes it as service_role.
revoke all on function public.get_push_recipients(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.get_push_recipients(uuid, text, uuid[]) to service_role;
