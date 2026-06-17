import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import {
  decisionQueryKeys,
  fetchGroupDecisions,
  runPicker,
  type DecisionWithDetails,
  type PickerResult,
  type RunPickerParams,
} from './decisions';

/**
 * TanStack Query hooks over the raw functions in ./decisions. Client-side
 * consumers only (mobile screens, future web client components). Server
 * code imports ./decisions directly — never this module.
 */

type HuddleClient = SupabaseClient<Database>;

export {
  decisionQueryKeys,
  type DecisionWithDetails,
  type PickerResult,
  type RunPickerParams,
};

// -----------------------------------------------------------------------
// Query hooks
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Mutation hooks
// -----------------------------------------------------------------------

/**
 * Run the picker. On a successful pick, the new decision is invalidated
 * into the group's History list. (`no_candidates` records nothing, so it
 * leaves the cache untouched.)
 */
export function useRunPicker(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: RunPickerParams) => runPicker(client, params),
    onSuccess: (result, { groupId }) => {
      if (result.outcome === 'picked') {
        void queryClient.invalidateQueries({
          queryKey: decisionQueryKeys.forGroup(groupId),
        });
      }
    },
  });
}
