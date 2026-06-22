-- =====================================================================
-- send-push triggers test suite (Phase 8)
-- =====================================================================
-- The end-to-end fan-out (INSERT -> trigger -> pg_net -> send-push) is
-- verified live (it needs the edge runtime + pg_net worker; see the
-- Phase 8 appendix). Here we just lock in that the three AFTER INSERT
-- triggers and their function exist, so an accidental drop is caught.
-- =====================================================================

begin;
select plan(5);

select has_function(
  'public', 'notify_send_push',
  'notify_send_push() trigger function exists'
);

select has_trigger(
  'public', 'ideas', 'ideas_send_push',
  'ideas has the send-push fan-out trigger'
);

select has_trigger(
  'public', 'decisions', 'decisions_send_push',
  'decisions has the send-push fan-out trigger'
);

select has_trigger(
  'public', 'group_invites', 'group_invites_send_push',
  'group_invites has the send-push fan-out trigger'
);

-- 16c: wall posts join the fan-out seam (for @mention push).
select has_trigger(
  'public', 'group_posts', 'group_posts_send_push',
  'group_posts has the send-push fan-out trigger'
);

select * from finish();
rollback;
