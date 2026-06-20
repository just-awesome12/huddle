import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import {
  reactionQueryKeys,
  reactionTargetKey,
  fetchGroupReactions,
  toggleReaction,
  REACTION_EMOJIS,
  type ReactionSummary,
  type ReactionTargetType,
  type ToggleReactionParams,
} from './reactions';

/** TanStack Query wrappers over ./reactions (mobile / client). */

type HuddleClient = SupabaseClient<Database>;

export {
  reactionQueryKeys,
  reactionTargetKey,
  REACTION_EMOJIS,
  type ReactionSummary,
  type ReactionTargetType,
};

export function useGroupReactions(
  client: HuddleClient,
  groupId: string,
  userId: string,
  options?: Omit<UseQueryOptions<Record<string, ReactionSummary[]>, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: reactionQueryKeys.group(groupId),
    queryFn: () => fetchGroupReactions(client, groupId, userId),
    ...options,
  });
}

export function useToggleReaction(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, reacted }: { params: ToggleReactionParams; reacted: boolean }) =>
      toggleReaction(client, params, reacted),
    onSuccess: (_data, { params }) => {
      void queryClient.invalidateQueries({ queryKey: reactionQueryKeys.group(params.groupId) });
    },
  });
}
