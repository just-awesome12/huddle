import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  subscribeToGroup,
  subscribeToMyGroups,
  type RealtimeStatus,
} from '@huddle/api-client/realtime';
import { groupQueryKeys } from '@huddle/api-client/groups-hooks';
import { inviteQueryKeys } from '@huddle/api-client/invites-hooks';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { invalidateForChange } from '@/lib/realtime-invalidate';

/**
 * Mobile realtime. Mirrors the web provider, but events invalidate the
 * TanStack Query cache (mobile's source of truth) instead of calling
 * router.refresh(). Mounted inside the (app) group, so it only runs
 * for signed-in users.
 *
 * Owns the global "my groups" channel. Per-group subscriptions are
 * opened by useGroupRealtime() on the screens that need them.
 *
 * Reconnect-on-resume: a socket dropped while backgrounded won't have
 * delivered events, so on return-to-foreground we reconnect and
 * invalidate everything to pull missed state.
 */

interface RealtimeContextValue {
  status: RealtimeStatus | 'CONNECTING';
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus | 'CONNECTING'>('CONNECTING');

  // Global "my groups" channel, re-established if the user changes.
  useEffect(() => {
    if (!userId) return;

    // Ensure the realtime socket carries the user's token (RLS gate).
    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) void supabase.realtime.setAuth(token);
    });

    const unsubscribe = subscribeToMyGroups(
      supabase,
      userId,
      (change) => invalidateForChange(queryClient, change),
      (s) => setStatus(s),
    );

    return unsubscribe;
  }, [userId, queryClient]);

  // Reconnect + refetch when returning from background.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;
      if (wasBackground && next === 'active') {
        // Socket may have dropped while backgrounded.
        supabase.realtime.connect();
        void queryClient.invalidateQueries({ queryKey: groupQueryKeys.all });
        void queryClient.invalidateQueries({ queryKey: inviteQueryKeys.mine });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  return <RealtimeContext.Provider value={{ status }}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeStatus(): RealtimeStatus | 'CONNECTING' {
  const ctx = useContext(RealtimeContext);
  // Tolerate use outside the provider (e.g. a screen rendered before
  // the provider mounts) — just report connecting.
  return ctx?.status ?? 'CONNECTING';
}

/**
 * Subscribe to one group's live changes for the duration of a screen.
 * Invalidates that group's queries on each event.
 */
export function useGroupRealtime(groupId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = subscribeToGroup(supabase, groupId, (change) =>
      invalidateForChange(queryClient, change),
    );
    return unsubscribe;
  }, [groupId, queryClient]);
}
