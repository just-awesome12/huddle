import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  candidateSetQueryKeys,
  fetchGroupCandidateSets,
  createCandidateSet,
  deleteCandidateSet,
  type CandidateSetRow,
  type CreateCandidateSetParams,
} from './candidate-sets';
import type { HuddleClient } from './internal';

/** TanStack Query hooks over ./candidate-sets (mobile / client components). */

export {
  candidateSetQueryKeys,
  type CandidateSetRow,
  type CreateCandidateSetParams,
} from './candidate-sets';

export function useGroupCandidateSets(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<CandidateSetRow[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: candidateSetQueryKeys.list(groupId),
    queryFn: () => fetchGroupCandidateSets(client, groupId),
    ...options,
  });
}

export function useCreateCandidateSet(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<CreateCandidateSetParams, 'groupId'>) =>
      createCandidateSet(client, { groupId, ...params }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: candidateSetQueryKeys.list(groupId) });
    },
  });
}

export function useDeleteCandidateSet(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => deleteCandidateSet(client, setId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: candidateSetQueryKeys.list(groupId) });
    },
  });
}
