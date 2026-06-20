-- =====================================================================
-- 025 — join-request push notifications (Phase 12)
-- =====================================================================
-- Extend the Phase 8 push fan-out to public-group join requests, reusing
-- the single seam notify_send_push() (D65):
--   * INSERT on group_join_requests (status 'pending') → 'join_request',
--     notifying the group's ADMINS (send-push resolves recipients).
--   * UPDATE to status 'approved' → 'join_approved', notifying the
--     requester. This is the first fan-out trigger on an UPDATE (the
--     others are INSERT-only); guarded by a WHEN clause so only the
--     pending→approved transition fires.
--
-- send-push branches on record.status to pick the event/recipients. Two
-- new default-on prefs (D66: absent row = all enabled).
-- =====================================================================

alter table public.notification_prefs
  add column join_request boolean not null default true,
  add column join_approved boolean not null default true;

comment on column public.notification_prefs.join_request is
  'Push (to admins) when someone asks to join a public group you run.';
comment on column public.notification_prefs.join_approved is
  'Push (to you) when your request to join a group is approved.';


create trigger group_join_requests_send_push_insert
  after insert on public.group_join_requests
  for each row execute function public.notify_send_push();

create trigger group_join_requests_send_push_approved
  after update of status on public.group_join_requests
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.notify_send_push();
