import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Idea upvotes (Phase 11) — framework-free; hooks in ./votes-hooks. Kept
 * separate from ./ideas so the shared idea reads stay untouched: the UI
 * fetches vote state for a group in one query and merges it in.
 */

export interface GroupVoteState {
  /** ideaId -> vote count, for every idea in the group that has votes. */
  countByIdea: Record<string, number>;
  /** ideaIds the current user has upvoted. */
  myVotes: string[];
}

export const voteQueryKeys = {
  forGroup: (groupId: string) => ['groups', groupId, 'votes'] as const,
};

/**
 * Vote counts for a group's ideas + which the caller upvoted, in one
 * query. RLS scopes idea_votes to the caller's groups.
 */
export async function fetchGroupVoteState(
  client: HuddleClient,
  groupId: string,
  userId: string,
): Promise<GroupVoteState> {
  const { data, error } = await client
    .from('idea_votes')
    .select('idea_id, user_id, ideas!inner(group_id)')
    .eq('ideas.group_id', groupId);
  if (error) throwMapped(error);

  const countByIdea: Record<string, number> = {};
  const myVotes: string[] = [];
  for (const row of (data ?? []) as unknown as { idea_id: string; user_id: string }[]) {
    countByIdea[row.idea_id] = (countByIdea[row.idea_id] ?? 0) + 1;
    if (row.user_id === userId) myVotes.push(row.idea_id);
  }
  return { countByIdea, myVotes };
}

/** Upvote an idea (idempotent — a repeat vote is a no-op). */
export async function voteIdea(client: HuddleClient, ideaId: string): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client
    .from('idea_votes')
    .upsert(
      { idea_id: ideaId, user_id: userId },
      { onConflict: 'idea_id,user_id', ignoreDuplicates: true },
    );
  if (error) throwMapped(error);
}

/** Remove the caller's upvote. */
export async function unvoteIdea(client: HuddleClient, ideaId: string): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client
    .from('idea_votes')
    .delete()
    .eq('idea_id', ideaId)
    .eq('user_id', userId);
  if (error) throwMapped(error);
}
