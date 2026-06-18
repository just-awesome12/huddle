import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  commentQueryKeys,
  fetchIdeaComments,
  fetchGroupCommentCounts,
  addComment,
  deleteComment,
  type CommentWithAuthor,
  type AddCommentParams,
} from './comments';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./comments (mobile / client components). */

export { commentQueryKeys, type CommentWithAuthor, type AddCommentParams } from './comments';

export function useIdeaComments(
  client: HuddleClient,
  groupId: string,
  ideaId: string,
  options?: Omit<UseQueryOptions<CommentWithAuthor[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: commentQueryKeys.thread(groupId, ideaId),
    queryFn: () => fetchIdeaComments(client, ideaId),
    ...options,
  });
}

export function useGroupCommentCounts(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<Record<string, number>, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: commentQueryKeys.counts(groupId),
    queryFn: () => fetchGroupCommentCounts(client, groupId),
    ...options,
  });
}

export function useAddComment(client: HuddleClient, groupId: string, ideaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment(client, { ideaId, groupId, body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKeys.thread(groupId, ideaId) });
      void queryClient.invalidateQueries({ queryKey: commentQueryKeys.counts(groupId) });
    },
  });
}

export function useDeleteComment(client: HuddleClient, groupId: string, ideaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(client, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentQueryKeys.thread(groupId, ideaId) });
      void queryClient.invalidateQueries({ queryKey: commentQueryKeys.counts(groupId) });
    },
  });
}
