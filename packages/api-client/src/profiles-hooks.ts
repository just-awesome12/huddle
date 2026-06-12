import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  profileQueryKeys,
  searchProfiles,
  type ProfileSearchResult,
} from './profiles';
import type { HuddleClient } from './internal';

/**
 * TanStack Query hooks over ./profiles. Client-side consumers only.
 */

export { profileQueryKeys, type ProfileSearchResult } from './profiles';

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
