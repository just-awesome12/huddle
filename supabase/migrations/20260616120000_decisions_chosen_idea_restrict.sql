-- =====================================================================
-- 015 — decisions.chosen_idea_id → ON DELETE NO ACTION
-- =====================================================================
-- Phase 7 flag (carried since Phase 1 / Phase 5): the FK was created
-- ON DELETE CASCADE, so hard-deleting an idea that a decision had
-- chosen would silently erase that history row — exactly the record
-- the history view exists to preserve.
--
-- We want two things at once:
--   (a) a DIRECT hard-delete of a chosen idea must fail, so history is
--       never lost. The app surfaces this as "dismiss instead" (set
--       status = 'dismissed'), which keeps the idea out of future
--       pickers while leaving the record intact.
--   (b) deleting the whole GROUP must still cascade everything away —
--       group deletion is the legitimate "wipe it all" path, and both
--       ideas and decisions hang off groups via ON DELETE CASCADE.
--
-- The right tool is NO ACTION, NOT RESTRICT. They raise the same
-- SQLSTATE (23503) for case (a), but differ on (b):
--   - RESTRICT checks IMMEDIATELY when the idea row is deleted. During a
--     group-delete cascade, the idea can be removed before the decision
--     that references it, so RESTRICT would abort the entire group
--     delete — a regression.
--   - NO ACTION defers the check to END of statement. The group cascade
--     deletes the referencing decision (via decisions.group_id CASCADE)
--     within the same statement, so by check time there's no referrer
--     and the group delete succeeds.
--
-- Note: candidate_idea_ids is a uuid[] and therefore has no FK; a
-- non-chosen candidate can still be deleted, leaving a dangling id in
-- the array. That's intentional — the array records what was *on the
-- table* at decision time, not a live reference.
-- =====================================================================

alter table public.decisions
  drop constraint decisions_chosen_idea_id_fkey,
  add constraint decisions_chosen_idea_id_fkey
    foreign key (chosen_idea_id)
    references public.ideas(id)
    on delete no action;

comment on constraint decisions_chosen_idea_id_fkey on public.decisions is
  'NO ACTION (Phase 7): a chosen idea cannot be hard-deleted directly (dismiss it instead, preserving history), but a group delete still cascades everything via the deferred end-of-statement check.';
