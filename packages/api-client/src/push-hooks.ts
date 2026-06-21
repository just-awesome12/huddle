import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  notificationQueryKeys,
  fetchNotificationPrefs,
  upsertNotificationPrefs,
  fetchGroupMute,
  setGroupMute,
  type NotificationPrefsInput,
  type NotificationPrefsRow,
} from './push';
import type { HuddleClient } from './internal';

/**
 * Hooks + imperative re-exports over ./push (mobile-only). Token
 * registration is imperative (called from the notifications lib, not a
 * render path), so it's re-exported here too — mobile touches a single
 * subpath (`@huddle/api-client/push-hooks`).
 */

export {
  registerPushToken,
  removePushToken,
  notificationQueryKeys,
  type NotificationPrefsInput,
  type NotificationPrefsRow,
} from './push';

export function useNotificationPrefs(
  client: HuddleClient,
  userId: string,
  options?: Omit<UseQueryOptions<NotificationPrefsRow | null, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: notificationQueryKeys.prefs(userId),
    queryFn: () => fetchNotificationPrefs(client, userId),
    ...options,
  });
}

export function useUpdateNotificationPrefs(client: HuddleClient, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPrefsInput) => upsertNotificationPrefs(client, prefs),
    onSuccess: (row) => {
      queryClient.setQueryData(notificationQueryKeys.prefs(userId), row);
    },
  });
}

/** Whether the current user has muted push for a group (Phase 15b). */
export function useGroupMute(
  client: HuddleClient,
  groupId: string,
  options?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: notificationQueryKeys.groupMute(groupId),
    queryFn: () => fetchGroupMute(client, groupId),
    ...options,
  });
}

export function useSetGroupMute(client: HuddleClient, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => setGroupMute(client, groupId, muted),
    onSuccess: (_data, muted) => {
      queryClient.setQueryData(notificationQueryKeys.groupMute(groupId), muted);
    },
  });
}
