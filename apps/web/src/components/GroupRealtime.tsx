'use client';

import { useEffect } from 'react';
import { subscribeToGroup } from '@huddle/api-client/realtime';
import { useRealtime } from './RealtimeProvider';

/**
 * Subscribes to one group's live changes (ideas, membership, the group
 * row, decisions) and triggers a throttled router.refresh() on any
 * event. Drop into a group-scoped page with the group id; renders
 * nothing. Reuses the provider's browser client and shared throttle.
 */
export function GroupRealtime({ groupId }: { groupId: string }) {
  const { client, scheduleRefresh } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribeToGroup(client, groupId, () => scheduleRefresh());
    return unsubscribe;
  }, [client, groupId, scheduleRefresh]);

  return null;
}
