import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  ideaQueryKeys,
  fetchGroupIdeas,
  fetchIdea,
  createIdea,
  updateIdea,
  updateIdeaStatus,
  deleteIdea,
  uploadIdeaPhoto,
  removeIdeaPhoto,
  getIdeaPhotoUrl,
  IDEA_PHOTO_URL_TTL_SECONDS,
  type IdeaFilters,
  type IdeaWithProposer,
  type CreateIdeaParams,
  type UpdateIdeaParams,
  type UploadIdeaPhotoParams,
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
  isAllowedPhotoType,
  type IdeaFilters,
  type IdeaWithProposer,
  type CreateIdeaParams,
  type UpdateIdeaParams,
  type UploadIdeaPhotoParams,
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
    mutationFn: ({ ideaId, photoPath }: { ideaId: string; photoPath?: string | null }) =>
      deleteIdea(client, ideaId, photoPath),
    onSuccess: (_data, { ideaId }) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
      queryClient.removeQueries({ queryKey: ideaQueryKeys.detail(ideaId) });
    },
  });
}

// -----------------------------------------------------------------------
// Photos (Phase 5.3)
// -----------------------------------------------------------------------

export function useUploadIdeaPhoto(client: HuddleClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UploadIdeaPhotoParams) => uploadIdeaPhoto(client, params),
    onSuccess: (_path, { groupId, ideaId }) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
      void queryClient.invalidateQueries({ queryKey: ideaQueryKeys.detail(ideaId) });
    },
  });
}

export function useRemoveIdeaPhoto(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ideaId, photoPath }: { ideaId: string; photoPath: string }) =>
      removeIdeaPhoto(client, ideaId, photoPath),
    onSuccess: (_data, { ideaId }) => {
      void queryClient.invalidateQueries({
        queryKey: ideaQueryKeys.allForGroup(groupId),
      });
      void queryClient.invalidateQueries({ queryKey: ideaQueryKeys.detail(ideaId) });
    },
  });
}

/** Signed photo URL, cached just under its TTL so a render never uses
 *  an expired link. */
export function useIdeaPhotoUrl(client: HuddleClient, photoPath: string | null) {
  return useQuery({
    queryKey: ['idea-photo-url', photoPath],
    queryFn: () => getIdeaPhotoUrl(client, photoPath!),
    enabled: !!photoPath,
    staleTime: (IDEA_PHOTO_URL_TTL_SECONDS - 60) * 1000,
  });
}
