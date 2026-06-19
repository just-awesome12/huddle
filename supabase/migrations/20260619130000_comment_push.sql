-- =====================================================================
-- 022 — comment push notifications (Phase 11.4)
-- =====================================================================
-- Extend the Phase 8 push fan-out to idea comments:
--   * a new per-user toggle (notification_prefs.new_comment), default-on
--     to match the absent-row = all-enabled convention (D66)
--   * an AFTER INSERT trigger on idea_comments reusing the generic
--     notify_send_push() function (the single fan-out seam, D65), so a
--     comment inserted from web OR mobile POSTs to send-push via pg_net.
--
-- send-push resolves table = 'idea_comments' to the 'new_comment' event,
-- notifies the idea's group members (minus the comment author), and
-- deep-links to the idea. No realtime change — comments already ride the
-- per-group channel (D74).
-- =====================================================================

alter table public.notification_prefs
  add column new_comment boolean not null default true;

comment on column public.notification_prefs.new_comment is
  'Push when someone comments on an idea in a group you are in.';

create trigger idea_comments_send_push
  after insert on public.idea_comments
  for each row execute function public.notify_send_push();
