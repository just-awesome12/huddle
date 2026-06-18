import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { groupQueryKeys } from './groups';
import {
  inviteQueryKeys,
  createInvite,
  fetchGroupInvites,
  fetchMyPendingInvites,
  revokeInvite,
  peekInvite,
  acceptInvite,
  type CreateInviteParams,
  type GroupInviteWithInvitee,
  type PendingInvite,
  type InvitePeek,
} from './invites';
import type { HuddleClient } from './internal';

/**
 * TanStack Query hooks over ./invites. Client-side consumers only;
 * server code imports ./invites directly (same pattern as groups).
 */

export {
  inviteQueryKeys,
  inviteErrorKind,
  type InviteErrorKind,
  type GroupInviteRow,
  type GroupInviteWithInvitee,
  type PendingInvite,
  type InvitePeek,
  type CreateInviteParams,
} from './invites';

export function useGroupInvites(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<GroupInviteWithInvitee[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: inviteQueryKeys.forGroup(groupId),
    queryFn: () => fetchGroupInvites(client, groupId),
    ...options,
  });
}

export function useMyPendingInvites(
  client: HuddleClient,
  options?: Omit<UseQueryOptions<PendingInvite[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: inviteQueryKeys.mine,
    queryFn: () => fetchMyPendingInvites(client),
    ...options,
  });
}

export function usePeekInvite(
  client: HuddleClient,
  token: string,
  options?: Omit<UseQueryOptions<InvitePeek, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: inviteQueryKeys.peek(token),
    queryFn: () => peekInvite(client, token),
    // A bad token is a terminal answer, not a transient failure.
    retry: false,
    ...options,
  });
}

export function useCreateInvite(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInviteParams) => createInvite(client, params),
    onSuccess: (_data, { groupId }) => {
      void queryClient.invalidateQueries({
        queryKey: inviteQueryKeys.forGroup(groupId),
      });
    },
  });
}

export function useRevokeInvite(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(client, inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: inviteQueryKeys.forGroup(groupId),
      });
    },
  });
}

export function useAcceptInvite(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => acceptInvite(client, token),
    onSuccess: () => {
      // Joining a group changes the caller's group list and consumes
      // one of their pending invites.
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: inviteQueryKeys.mine });
    },
  });
}
