-- =====================================================================
-- 018 — de-attribute content on account deletion (Phase 10)
-- =====================================================================
-- In-app account deletion (OQ-6) removes a user's auth.users row, which
-- cascades to their profile and onward. Two of those onward FKs were
-- ON DELETE CASCADE, which is wrong for deletion:
--
--   - ideas.proposed_by  → deleting the user would delete every idea
--     they ever proposed, ACROSS ALL GROUPS — destroying group content
--     others rely on. Worse, if any such idea was a picker outcome, the
--     Phase 7 decisions.chosen_idea_id NO ACTION FK would BLOCK the
--     cascade and the whole account deletion would fail.
--   - decisions.run_by   → would delete the user's decisions, breaking
--     the append-only history other members can see.
--
-- Fix: both become nullable + ON DELETE SET NULL. Deleting a user now
-- DE-ATTRIBUTES their ideas and decisions ("a former member") instead of
-- deleting them — the personal link is severed (profile/email/username
-- are gone) while the group's shared content and history survive. The
-- apps already render a null proposer/runner as "someone".
--
-- group_members stays ON DELETE CASCADE (your memberships are personal
-- and should vanish); the delete-account function handles the last-admin
-- trigger by refusing sole-admin-of-a-multi-member-group and deleting
-- solo groups up front.
-- =====================================================================

alter table public.ideas alter column proposed_by drop not null;
alter table public.ideas
  drop constraint ideas_proposed_by_fkey,
  add constraint ideas_proposed_by_fkey
    foreign key (proposed_by) references public.profiles(id) on delete set null;

alter table public.decisions alter column run_by drop not null;
alter table public.decisions
  drop constraint decisions_run_by_fkey,
  add constraint decisions_run_by_fkey
    foreign key (run_by) references public.profiles(id) on delete set null;

comment on constraint ideas_proposed_by_fkey on public.ideas is
  'SET NULL (Phase 10): account deletion de-attributes ideas, not delete them (preserves group content + the chosen-idea NO ACTION FK).';
comment on constraint decisions_run_by_fkey on public.decisions is
  'SET NULL (Phase 10): account deletion de-attributes decisions, preserving append-only history.';
