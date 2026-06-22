import type { Database } from '@huddle/types';
import { throwMapped, requireUserId, type HuddleClient } from './internal';

/**
 * Group wall data layer (Phase 14) — framework-free; hooks in
 * ./posts-hooks. A flat, group-level thread ("anyone free this
 * weekend?"). RLS scopes everything to group members (and hides blocked
 * authors). Posts go live via the per-group realtime channel.
 */

type PostRow = Database['public']['Tables']['group_posts']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface PostWithAuthor extends PostRow {
  author: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
}

export interface AddPostParams {
  groupId: string;
  body: string;
}

export const postQueryKeys = {
  wall: (groupId: string) => ['groups', groupId, 'posts'] as const,
};

const POST_SELECT =
  '*, author:profiles!group_posts_author_id_fkey(id, username, display_name, avatar_url)';

/** A group's wall, pinned first then newest (RLS: members only; blocked hidden). */
export async function fetchGroupPosts(
  client: HuddleClient,
  groupId: string,
  limit = 100,
): Promise<PostWithAuthor[]> {
  const { data, error } = await client
    .from('group_posts')
    .select(POST_SELECT)
    .eq('group_id', groupId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throwMapped(error);
  return (data ?? []) as unknown as PostWithAuthor[];
}

/** Pin or unpin a post (15e). Admin-only via the set_post_pinned RPC. */
export async function setPostPinned(
  client: HuddleClient,
  postId: string,
  pinned: boolean,
): Promise<void> {
  const { error } = await client.rpc('set_post_pinned', {
    p_post_id: postId,
    p_pinned: pinned,
  });
  if (error) throwMapped(error);
}

/** Post to the wall as the current user. */
export async function addGroupPost(client: HuddleClient, params: AddPostParams): Promise<void> {
  const userId = await requireUserId(client);
  const { error } = await client.from('group_posts').insert({
    group_id: params.groupId,
    author_id: userId,
    body: params.body,
  });
  if (error) throwMapped(error);
}

/** Delete a post (RLS: author or a group admin). */
export async function deleteGroupPost(client: HuddleClient, postId: string): Promise<void> {
  const { error } = await client.from('group_posts').delete().eq('id', postId);
  if (error) throwMapped(error);
}
