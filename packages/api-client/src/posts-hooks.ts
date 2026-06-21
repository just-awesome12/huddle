import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  postQueryKeys,
  fetchGroupPosts,
  addGroupPost,
  deleteGroupPost,
  type PostWithAuthor,
} from './posts';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./posts (mobile / client components). */

export { postQueryKeys, type PostWithAuthor, type AddPostParams } from './posts';

export function useGroupPosts(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<PostWithAuthor[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: postQueryKeys.wall(groupId),
    queryFn: () => fetchGroupPosts(client, groupId),
    ...options,
  });
}

export function useAddGroupPost(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addGroupPost(client, { groupId, body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postQueryKeys.wall(groupId) });
    },
  });
}

export function useDeleteGroupPost(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deleteGroupPost(client, postId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postQueryKeys.wall(groupId) });
    },
  });
}
