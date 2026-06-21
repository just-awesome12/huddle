-- =====================================================================
-- 033 — targeted reaction + RSVP push (Phase 15, slice 15b.2)
-- =====================================================================
-- D84/D85 deferred reaction/RSVP push as "high-frequency." The panel
-- wanted the signal but not the noise, so these are TARGETED, not
-- broadcast: a reaction notifies only the target's AUTHOR; an RSVP of
-- "going" notifies only the idea's PROPOSER. Combined with per-group
-- mute (15b.1) + the new prefs toggles, small groups can keep it quiet
-- while active groups get the signal.
--
-- Both default-on (D66 philosophy). Triggers reuse the single fan-out
-- seam (notify_send_push, D65); send-push resolves the recipient.
-- =====================================================================

alter table public.notification_prefs
  add column reaction boolean not null default true,
  add column rsvp boolean not null default true;

-- Every reaction fans out (send-push resolves the target's author and
-- drops self-reactions via actor exclusion).
create trigger reactions_send_push
  after insert on public.reactions
  for each row execute function public.notify_send_push();

-- RSVP push fires only for "going" — on a fresh going RSVP or a flip to
-- going (mirrors the join-request approved pattern, D81). maybe/not_going
-- never notify, so send-push only ever sees going rows here.
create trigger idea_rsvps_send_push_insert
  after insert on public.idea_rsvps
  for each row
  when (new.status = 'going')
  execute function public.notify_send_push();

create trigger idea_rsvps_send_push_going
  after update of status on public.idea_rsvps
  for each row
  when (new.status = 'going' and old.status is distinct from 'going')
  execute function public.notify_send_push();
