import type { QueryClient } from '@tanstack/react-query';
import { groupQueryKeys } from '@huddle/api-client/groups-hooks';
import { ideaQueryKeys } from '@huddle/api-client/ideas-hooks';
import { inviteQueryKeys } from '@huddle/api-client/invites-hooks';
import type { RealtimeChange } from '@huddle/api-client/realtime';

/**
 * Map a realtime change to the TanStack Query keys it invalidates.
 * Mobile-only: web uses router.refresh() instead (no client cache).
 *
 * Conservative on purpose — invalidate is cheap (a refetch only fires
 * for queries currently mounted/observed), and over-invalidating is
 * safer than a stale screen. `decisions` is wired for Phase 7; until
 * then there are no decision queries to hit.
 */
export function invalidateForChange(queryClient: QueryClient, change: RealtimeChange): void {
  const { table, groupId } = change;

  switch (table) {
    case 'ideas':
      if (groupId) {
        void queryClient.invalidateQueries({
          queryKey: ideaQueryKeys.allForGroup(groupId),
        });
      }
      break;

    case 'group_members':
      // Roster changed → that group's members + my group list (I may
      // have been added/removed) + my pending invites (accepting one
      // creates a membership row).
      if (groupId) {
        void queryClient.invalidateQueries({
          queryKey: groupQueryKeys.members(groupId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: inviteQueryKeys.mine });
      break;

    case 'groups':
      if (groupId) {
        void queryClient.invalidateQueries({
          queryKey: groupQueryKeys.detail(groupId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
      break;

    case 'decisions':
      // Phase 7. No decision queries exist yet.
      break;
  }
}
