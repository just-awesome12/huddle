-- =====================================================================
-- 039 — @mention push (Phase 16, slice 16c)
-- =====================================================================
-- @mentions in a comment or wall post ping the mentioned member. Reuses
-- the single fan-out seam (D65): send-push parses the body, resolves
-- @usernames to group-member ids, and dispatches a `mention` event.
--   • idea_comments already fires notify_send_push (D76) — send-push now
--     ALSO emits `mention` to mentioned members (and drops them from the
--     broadcast new_comment so they aren't double-notified).
--   • group_posts had NO push; this adds the trigger so wall @mentions
--     ping (the wall doesn't broadcast — only mentions notify).
--
-- notification_prefs gains `mention` (default-on, D66); get_push_recipients
-- returns it so the @huddle/core selection can honour it.
-- =====================================================================

alter table public.notification_prefs
  add column mention boolean not null default true;

-- Wall posts join the fan-out seam (idea_comments already has its trigger).
create trigger group_posts_send_push
  after insert on public.group_posts
  for each row execute function public.notify_send_push();

-- Recreate get_push_recipients to include the new `mention` pref in the
-- aggregated jsonb (otherwise send-push can't honour the mention opt-out).
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
        'join_approved', np.join_approved, 'reaction', np.reaction, 'rsvp', np.rsvp,
        'mention', np.mention))
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

revoke all on function public.get_push_recipients(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.get_push_recipients(uuid, text, uuid[]) to service_role;
