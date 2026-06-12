import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  ideaQueryKeys,
  fetchGroupIdeas,
  fetchIdea,
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
  type IdeaFilters,
  type IdeaWithProposer,
  type CreateIdeaParams,
  type UpdateIdeaParams,
} from './ideas';
import type { HuddleClient } from './internal';
import type { Database } from '@huddle/types';

/**
 * TanStack Query hooks over ./ideas. Client-side consumers only;
 * server code imports ./ideas directly (same pattern as groups).
 */

type IdeaStatus = Database['public']['Enums']['idea_status'];

export {
  ideaQueryKeys,
  type IdeaFilters,
  type IdeaWithProposer,
  type CreateIdeaParams,
  type UpdateIdeaParams,
} from './ideas';

export function useGroupIdeas(
  client: HuddleClient,
  groupId: string,
  filters: IdeaFilters = {},
  options?: Omit<UseQueryOptions<IdeaWithProposer[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ideaQueryKeys.forGroup(groupId, filters),
    queryFn: () => fetchGroupIdeas(client, groupId, filters),
    ...options,
  });
}

export function useIdea(
  client: HuddleClient,
  ideaId: string,
  options?: Omit<UseQueryOptions<IdeaWithProposer, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ideaQueryKeys.detail(ideaId),
    queryFn: () => fetchIdea(client, ideaId),
    ...options,
  });
}

export function useCreateIdea(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateIdeaParams) => createIdea(client, params),
    onSuccess: (_data, { groupId }) => {
      // Invalidates every filter combination for the group at once.
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
    },
  });
}

export function useUpdateIdea(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, params }: { ideaId: string; params: UpdateIdeaParams }) =>
      updateIdea(client, ideaId, params),
    onSuccess: (idea) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(idea.group_id),
      });
      void queryClient.invalidateQueries({ queryKey: ideaQueryKeys.detail(idea.id) });
    },
  });
}

export function useUpdateIdeaStatus(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, status }: { ideaId: string; status: IdeaStatus }) =>
      updateIdeaStatus(client, ideaId, status),
    onSuccess: (idea) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(idea.group_id),
      });
      void queryClient.invalidateQueries({ queryKey: ideaQueryKeys.detail(idea.id) });
    },
  });
}

export function useDeleteIdea(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => deleteIdea(client, ideaId),
    onSuccess: (_data, ideaId) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
      queryClient.removeQueries({ queryKey: ideaQueryKeys.detail(ideaId) });
    },
  });
}
