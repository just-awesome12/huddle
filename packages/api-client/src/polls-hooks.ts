import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  pollQueryKeys,
  fetchGroupPolls,
  createPoll,
  castVote,
  clearVote,
  setPollClosed,
  deletePoll,
  type PollWithResults,
  type CreatePollParams,
} from './polls';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./polls (mobile / client components). */

export {
  pollQueryKeys,
  type PollWithResults,
  type PollOptionWithCount,
  type CreatePollParams,
} from './polls';

export function useGroupPolls(
  client: HuddleClient,
  groupId: string,
  userId: string,
  options?: Omit<UseQueryOptions<PollWithResults[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: pollQueryKeys.list(groupId),
    queryFn: () => fetchGroupPolls(client, groupId, userId),
    ...options,
  });
}

export function useCreatePoll(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<CreatePollParams, 'groupId'>) =>
      createPoll(client, { groupId, ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.list(groupId) });
    },
  });
}

export function useCastVote(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { pollId: string; optionId: string }) =>
      castVote(client, { groupId, ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.list(groupId) });
    },
  });
}

export function useClearVote(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pollId: string) => clearVote(client, pollId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.list(groupId) });
    },
  });
}

export function useSetPollClosed(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pollId, closed }: { pollId: string; closed: boolean }) =>
      setPollClosed(client, pollId, closed),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.list(groupId) });
    },
  });
}

export function useDeletePoll(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pollId: string) => deletePoll(client, pollId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pollQueryKeys.list(groupId) });
    },
  });
}
