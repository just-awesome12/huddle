import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  profileQueryKeys,
  searchProfiles,
  fetchProfile,
  updateProfile,
  uploadAvatar,
  type ProfileSearchResult,
  type UpdateProfileInput,
  type AvatarUpload,
} from './profiles';
import type { Database } from '@huddle/types';
import type { HuddleClient } from './internal';

/**
 * TanStack Query hooks over ./profiles. Client-side consumers only.
 */

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export { profileQueryKeys, type ProfileSearchResult } from './profiles';

export function useProfile(
  client: HuddleClient,
  userId: string,
  options?: Omit<UseQueryOptions<ProfileRow, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: profileQueryKeys.detail(userId),
    queryFn: () => fetchProfile(client, userId),
    ...options,
  });
}

export function useUpdateProfile(client: HuddleClient, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProfileInput) => updateProfile(client, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.detail(userId) });
    },
  });
}

export function useUploadAvatar(client: HuddleClient) {
  return useMutation({
    mutationFn: (params: AvatarUpload) => uploadAvatar(client, params),
  });
}

export function useSearchProfiles(
  client: HuddleClient,
  q: string,
  options?: Omit<UseQueryOptions<ProfileSearchResult[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: profileQueryKeys.search(q),
    queryFn: () => searchProfiles(client, q),
    // Search-as-you-type: results for a prefix don't change mid-session
    // often; keep them briefly to avoid refetch churn while typing.
    staleTime: 15_000,
    ...options,
  });
}
