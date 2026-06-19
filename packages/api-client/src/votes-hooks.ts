import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  voteQueryKeys,
  fetchGroupVoteState,
  voteIdea,
  unvoteIdea,
  type GroupVoteState,
} from './votes';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./votes (mobile / client components). */

export { voteQueryKeys, type GroupVoteState } from './votes';

export function useGroupVoteState(
  client: HuddleClient,
  groupId: string,
  userId: string,
  options?: Omit<UseQueryOptions<GroupVoteState, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: voteQueryKeys.forGroup(groupId),
    queryFn: () => fetchGroupVoteState(client, groupId, userId),
    ...options,
  });
}

export function useVoteIdea(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, voted }: { ideaId: string; voted: boolean }) =>
      voted ? unvoteIdea(client, ideaId) : voteIdea(client, ideaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voteQueryKeys.forGroup(groupId) });
    },
  });
}
