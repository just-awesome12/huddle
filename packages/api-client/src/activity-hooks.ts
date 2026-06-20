import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@huddle/types';
import {
  activityQueryKeys,
  fetchGroupActivity,
  type ActivityItem,
  type ActivityKind,
} from './activity';

/** TanStack Query wrapper over fetchGroupActivity (mobile / client). */

type HuddleClient = SupabaseClient<Database>;

export { activityQueryKeys, type ActivityItem, type ActivityKind };

export function useGroupActivity(
  client: HuddleClient,
  groupId: string,
  limit = 20,
  options?: Omit<UseQueryOptions<ActivityItem[], Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: activityQueryKeys.feed(groupId),
    queryFn: () => fetchGroupActivity(client, groupId, limit),
    ...options,
  });
}
