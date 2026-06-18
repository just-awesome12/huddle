import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  decisionQueryKeys,
  fetchGroupDecisions,
  runPicker,
  type DecisionWithDetails,
  type RunPickerParams,
  type RunPickerResult,
} from './decisions';
import { ideaQueryKeys } from './ideas';
import type { HuddleClient } from './internal';

/**
 * TanStack Query hooks over ./decisions (mobile / client components).
 * Server code imports ./decisions directly.
 */

export {
  decisionQueryKeys,
  PickerError,
  type DecisionWithDetails,
  type RunPickerParams,
  type RunPickerResult,
  type PickerErrorCode,
} from './decisions';

export function useGroupDecisions(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<DecisionWithDetails[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: decisionQueryKeys.forGroup(groupId),
    queryFn: () => fetchGroupDecisions(client, groupId),
    ...options,
  });
}

/**
 * Run the picker. On success, refresh the group's decision history (and
 * its ideas, in case the UI reflects the outcome there). The chosen idea
 * is returned for the reveal animation.
 */
export function useRunPicker(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation<RunPickerResult, Error, RunPickerParams>({
    mutationFn: (params) => runPicker(client, params),
    onSuccess: (_result, { groupId }) => {
      void queryClient.invalidateQueries({
        queryKey: decisionQueryKeys.forGroup(groupId),
      });
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
    },
  });
}
