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
  deleteGroup,
  leaveGroup,
  removeMember,
  type GroupWithRole,
  type GroupMemberWithProfile,
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
export { groupQueryKeys, type GroupWithRole, type GroupMemberWithProfile };

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
    mutationFn: (name: string) => createGroup(client, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
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
