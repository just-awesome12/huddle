import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import {
  groupQueryKeys,
  fetchMyGroups,
  fetchGroup,
  fetchGroupMembers,
  createGroup,
  renameGroup,
  updateGroup,
  deleteGroup,
  leaveGroup,
  removeMember,
  searchPublicGroups,
  requestToJoin,
  fetchJoinRequests,
  respondToJoinRequest,
  fetchMyJoinRequests,
  withdrawJoinRequest,
  type GroupWithRole,
  type GroupMemberWithProfile,
  type JoinRequestRow,
  type JoinRequestWithProfile,
  type GroupSearchParams,
  type CreateGroupOptions,
  type UpdateGroupInput,
} from './groups';

/**
 * TanStack Query hooks over the raw functions in ./groups. Client-side
 * consumers only (mobile screens, future web client components). Server
 * code imports ./groups directly — never this module — so react-query
 * stays out of server bundles.
 */

type HuddleClient = SupabaseClient<Database>;
type GroupRow = Database['public']['Tables']['groups']['Row'];

// Re-export so hook consumers don't need a second import for the types.
export {
  groupQueryKeys,
  type GroupWithRole,
  type GroupMemberWithProfile,
  type JoinRequestRow,
  type JoinRequestWithProfile,
  type GroupSearchParams,
  type CreateGroupOptions,
  type UpdateGroupInput,
};

// -----------------------------------------------------------------------
// Query hooks
// -----------------------------------------------------------------------

export function useMyGroups(
  client: HuddleClient,
  options?: Omit<UseQueryOptions<GroupWithRole[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.all,
    queryFn: () => fetchMyGroups(client),
    ...options,
  });
}

export function useGroup(
  client: HuddleClient,
  id: string,
  options?: Omit<UseQueryOptions<GroupRow, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.detail(id),
    queryFn: () => fetchGroup(client, id),
    ...options,
  });
}

export function useGroupMembers(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<GroupMemberWithProfile[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.members(groupId),
    queryFn: () => fetchGroupMembers(client, groupId),
    ...options,
  });
}

// -----------------------------------------------------------------------
// Mutation hooks
// -----------------------------------------------------------------------

export function useCreateGroup(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    // Accepts a bare name (back-compat) or { name, ...options }.
    mutationFn: (input: string | ({ name: string } & CreateGroupOptions)) => {
      if (typeof input === 'string') return createGroup(client, input);
      const { name, ...opts } = input;
      return createGroup(client, name, opts);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
    },
  });
}

/** Update group fields (name/description/location/tags/visibility). */
export function useUpdateGroupFields(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, patch }: { groupId: string; patch: UpdateGroupInput }) =>
      updateGroup(client, groupId, patch),
    onSuccess: (_data, { groupId }) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.detail(groupId) });
    },
  });
}

export function useUpdateGroup(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      renameGroup(client, groupId, name),
    onSuccess: (_data, { groupId }) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.detail(groupId) });
    },
  });
}

export function useDeleteGroup(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(client, groupId),
    onSuccess: (_data, groupId) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      queryClient.removeQueries({ queryKey: groupQueryKeys.detail(groupId) });
      queryClient.removeQueries({ queryKey: groupQueryKeys.members(groupId) });
    },
  });
}

export function useLeaveGroup(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => leaveGroup(client, groupId),
    onSuccess: (_data, groupId) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      queryClient.removeQueries({ queryKey: groupQueryKeys.detail(groupId) });
      queryClient.removeQueries({ queryKey: groupQueryKeys.members(groupId) });
    },
  });
}

export function useRemoveMember(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      removeMember(client, groupId, userId),
    onSuccess: (_data, { groupId }) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.members(groupId) });
    },
  });
}

// -----------------------------------------------------------------------
// Discovery + join requests
// -----------------------------------------------------------------------

export function useSearchPublicGroups(
  client: HuddleClient,
  params: GroupSearchParams,
  options?: Omit<UseQueryOptions<GroupRow[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.discover(params),
    queryFn: () => searchPublicGroups(client, params),
    ...options,
  });
}

export function useJoinRequests(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<JoinRequestWithProfile[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.joinRequests(groupId),
    queryFn: () => fetchJoinRequests(client, groupId),
    ...options,
  });
}

export function useMyJoinRequests(
  client: HuddleClient,
  options?: Omit<UseQueryOptions<JoinRequestRow[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: groupQueryKeys.myJoinRequests,
    queryFn: () => fetchMyJoinRequests(client),
    ...options,
  });
}

export function useRequestToJoin(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, message }: { groupId: string; message?: string }) =>
      requestToJoin(client, groupId, message),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.myJoinRequests });
    },
  });
}

export function useRespondToJoinRequest(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { requestId: string; approve: boolean; groupId: string }) =>
      respondToJoinRequest(client, vars.requestId, vars.approve),
    onSuccess: (_data, { groupId }) => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.joinRequests(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.members(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.detail(groupId) });
    },
  });
}

export function useWithdrawJoinRequest(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => withdrawJoinRequest(client, requestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.myJoinRequests });
    },
  });
}
