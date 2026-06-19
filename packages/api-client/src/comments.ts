import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Idea comments data layer (Phase 11) — framework-free; hooks in
 * ./comments-hooks. RLS scopes everything to group members (and hides
 * blocked authors). Comments go live via the per-group realtime channel.
 */

type CommentRow = Database['public']['Tables']['idea_comments']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface CommentWithAuthor extends CommentRow {
  author: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface AddCommentParams {
  ideaId: string;
  groupId: string;
  body: string;
}

export const commentQueryKeys = {
  thread: (groupId: string, ideaId: string) =>
    ['groups', groupId, 'comments', 'thread', ideaId] as const,
  counts: (groupId: string) => ['groups', groupId, 'comments', 'counts'] as const,
};

const COMMENT_SELECT =
  '*, author:profiles!idea_comments_author_id_fkey(id, username, display_name, avatar_url)';

/** An idea's comments, oldest first (RLS: members only; blocked hidden). */
export async function fetchIdeaComments(
  client: HuddleClient,
  ideaId: string,
): Promise<CommentWithAuthor[]> {
  const { data, error } = await client
    .from('idea_comments')
    .select(COMMENT_SELECT)
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });
  if (error) throwMapped(error);
  return (data ?? []) as unknown as CommentWithAuthor[];
}

/** ideaId -> comment count for a group's ideas, in one query. */
export async function fetchGroupCommentCounts(
  client: HuddleClient,
  groupId: string,
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from('idea_comments')
    .select('idea_id')
    .eq('group_id', groupId);
  if (error) throwMapped(error);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { idea_id: string }[]) {
    counts[row.idea_id] = (counts[row.idea_id] ?? 0) + 1;
  }
  return counts;
}

/** Post a comment as the current user. */
export async function addComment(client: HuddleClient, params: AddCommentParams): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('idea_comments').insert({
    idea_id: params.ideaId,
    group_id: params.groupId,
    author_id: userId,
    body: params.body,
  });
  if (error) throwMapped(error);
}

/** Delete a comment (RLS: author or a group admin). */
export async function deleteComment(client: HuddleClient, commentId: string): Promise<void> {
  const { error } = await client.from('idea_comments').delete().eq('id', commentId);
  if (error) throwMapped(error);
}
