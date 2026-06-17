-- =====================================================================
-- 015 — preserve decision history when a chosen idea is deleted
-- =====================================================================
-- Phase 7 prerequisite (flagged in the Phase 5 appendix + deleteIdea).
--
-- decisions.chosen_idea_id was created ON DELETE CASCADE, which means
-- hard-deleting an idea that the picker once chose would silently erase
-- the decision row — destroying the very history the table exists to
-- guarantee. We want the opposite: a chosen idea cannot be hard-deleted
-- out from under its history.
--
-- Why NO ACTION and NOT RESTRICT (decision D60):
--   RESTRICT is non-deferrable: it fires the instant a referenced idea
--   is removed. Deleting a GROUP cascades to BOTH ideas and decisions in
--   one statement; with RESTRICT, the idea-delete half of that cascade
--   would abort before the decision-delete half could clear the
--   reference. NO ACTION defers the check to end-of-statement, by which
--   point the cascading decision delete has already removed the
--   reference — so group deletion still cascades cleanly, while a DIRECT
--   `delete from ideas` of a chosen idea is blocked (23503). That direct
--   block is what the UI turns into "dismiss instead of delete".
--
-- group_id and run_by keep ON DELETE CASCADE (deleting a group or a user
-- should still remove their decision rows). Only chosen_idea_id changes.
-- =====================================================================

alter table public.decisions
  drop constraint decisions_chosen_idea_id_fkey,
  add constraint decisions_chosen_idea_id_fkey
    foreign key (chosen_idea_id)
    references public.ideas(id)
    on delete no action;

comment on constraint decisions_chosen_idea_id_fkey on public.decisions is
  'NO ACTION (not CASCADE): a chosen idea cannot be hard-deleted while a '
  'decision references it (history is immutable); group/user deletion '
  'still cascades because the referencing decision is removed in the '
  'same statement. See D60.';
