'use server';

import { revalidatePath } from 'next/cache';
import { voteIdea, unvoteIdea } from '@huddle/api-client/votes';
import { getSupabaseServerClient } from '@/lib/supabase';

/**
 * Toggle the caller's upvote on an idea (Phase 11). `voted` is the
 * CURRENT state (bound from the server render); we flip it. Revalidates
 * the group + idea so counts refresh.
 */
export async function toggleVoteAction(
  groupId: string,
  ideaId: string,
  voted: boolean,
  _formData: FormData,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  try {
    if (voted) await unvoteIdea(supabase, ideaId);
    else await voteIdea(supabase, ideaId);
  } catch {
    // Voting is best-effort; a failure just leaves the count unchanged.
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/ideas/${ideaId}`);
}
