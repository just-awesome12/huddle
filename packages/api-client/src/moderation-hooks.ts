import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  moderationQueryKeys,
  reportIdea,
  fetchMyReportedIdeaIds,
  blockUser,
  unblockUser,
  fetchBlockedProfiles,
  type ReportIdeaParams,
  type BlockedProfile,
} from './moderation';
import type { HuddleClient } from './internal';

/**
 * TanStack Query hooks over ./moderation (mobile / client components).
 */

export { moderationQueryKeys, type ReportIdeaParams, type BlockedProfile } from './moderation';

export function useReportIdea(client: HuddleClient, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ReportIdeaParams) => reportIdea(client, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: moderationQueryKeys.reportedIdeas(userId),
      });
    },
  });
}

export function useMyReportedIdeaIds(
  client: HuddleClient,
  userId: string,
  options?: Omit<UseQueryOptions<string[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: moderationQueryKeys.reportedIdeas(userId),
    queryFn: () => fetchMyReportedIdeaIds(client),
    ...options,
  });
}

export function useBlockedProfiles(
  client: HuddleClient,
  userId: string,
  options?: Omit<UseQueryOptions<BlockedProfile[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: moderationQueryKeys.blocked(userId),
    queryFn: () => fetchBlockedProfiles(client),
    ...options,
  });
}

export function useBlockUser(client: HuddleClient, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: string) => blockUser(client, blockedId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: moderationQueryKeys.blocked(userId),
      });
      // Blocked user's ideas are now hidden by RLS — refresh idea lists.
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUnblockUser(client: HuddleClient, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: string) => unblockUser(client, blockedId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: moderationQueryKeys.blocked(userId),
      });
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}
