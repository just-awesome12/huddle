import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import {
  rsvpQueryKeys,
  fetchIdeaRsvps,
  fetchGroupRsvpState,
  setRsvp,
  removeRsvp,
  type IdeaRsvp,
  type GroupRsvpState,
  type RsvpStatus,
} from './rsvps';

/** TanStack Query wrappers over ./rsvps (mobile / client). */

type HuddleClient = SupabaseClient<Database>;

export { rsvpQueryKeys, type IdeaRsvp, type GroupRsvpState, type RsvpStatus };

export function useIdeaRsvps(
  client: HuddleClient,
  ideaId: string,
  options?: Omit<UseQueryOptions<IdeaRsvp[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: rsvpQueryKeys.idea(ideaId),
    queryFn: () => fetchIdeaRsvps(client, ideaId),
    ...options,
  });
}

export function useGroupRsvpState(
  client: HuddleClient,
  groupId: string,
  userId: string,
  options?: Omit<UseQueryOptions<GroupRsvpState, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: rsvpQueryKeys.groupState(groupId),
    queryFn: () => fetchGroupRsvpState(client, groupId, userId),
    ...options,
  });
}

export function useSetRsvp(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ideaId,
      groupId,
      status,
    }: {
      ideaId: string;
      groupId: string;
      status: RsvpStatus;
    }) => setRsvp(client, ideaId, groupId, status),
    onSuccess: (_data, { ideaId, groupId }) => {
      void queryClient.invalidateQueries({ queryKey: rsvpQueryKeys.idea(ideaId) });
      void queryClient.invalidateQueries({ queryKey: rsvpQueryKeys.groupState(groupId) });
    },
  });
}

export function useRemoveRsvp(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId }: { ideaId: string; groupId: string }) => removeRsvp(client, ideaId),
    onSuccess: (_data, { ideaId, groupId }) => {
      void queryClient.invalidateQueries({ queryKey: rsvpQueryKeys.idea(ideaId) });
      void queryClient.invalidateQueries({ queryKey: rsvpQueryKeys.groupState(groupId) });
    },
  });
}
