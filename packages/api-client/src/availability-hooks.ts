import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  availabilityQueryKeys,
  fetchGroupAvailabilityPolls,
  createAvailabilityPoll,
  setAvailability,
  setAvailabilityClosed,
  deleteAvailabilityPoll,
  type AvailabilityPollWithResults,
  type AvailabilityStatus,
  type CreateAvailabilityPollParams,
} from './availability';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./availability (mobile / client components). */

export {
  availabilityQueryKeys,
  type AvailabilityPollWithResults,
  type AvailabilityDateResult,
  type AvailabilityStatus,
  type CreateAvailabilityPollParams,
} from './availability';

export function useGroupAvailabilityPolls(
  client: HuddleClient,
  groupId: string,
  userId: string,
  options?: Omit<UseQueryOptions<AvailabilityPollWithResults[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: availabilityQueryKeys.list(groupId),
    queryFn: () => fetchGroupAvailabilityPolls(client, groupId, userId),
    ...options,
  });
}

export function useCreateAvailabilityPoll(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<CreateAvailabilityPollParams, 'groupId'>) =>
      createAvailabilityPoll(client, { groupId, ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.list(groupId) });
    },
  });
}

export function useSetAvailability(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { pollId: string; dateId: string; status: AvailabilityStatus }) =>
      setAvailability(client, { groupId, ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.list(groupId) });
    },
  });
}

export function useSetAvailabilityClosed(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pollId, closed }: { pollId: string; closed: boolean }) =>
      setAvailabilityClosed(client, pollId, closed),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.list(groupId) });
    },
  });
}

export function useDeleteAvailabilityPoll(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pollId: string) => deleteAvailabilityPoll(client, pollId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: availabilityQueryKeys.list(groupId) });
    },
  });
}
