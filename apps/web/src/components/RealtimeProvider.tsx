'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  subscribeToMyGroups,
  type RealtimeStatus,
} from '@huddle/api-client/realtime';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';

/**
 * Web realtime. Web reads are Server Components with no client query
 * cache (D43), so a realtime event triggers a throttled router.refresh()
 * — that re-runs the Server Components and refetches. The provider owns
 * the global "my groups" channel (so the groups list reacts to being
 * invited/removed) and exposes:
 *   - the shared browser Supabase client (a singleton)
 *   - a throttled refresh callback for per-page <GroupRealtime />
 *   - connection status for the indicator dot
 *
 * The realtime socket must be authed as the user or RLS blocks
 * everything (R-4). The @supabase/ssr browser client propagates the
 * cookie session to realtime, but we setAuth explicitly to be safe.
 */

interface RealtimeContextValue {
  client: ReturnType<typeof getBrowserSupabaseClient>;
  status: RealtimeStatus | 'CONNECTING';
  /** Leading+trailing throttled router.refresh(), shared by consumers. */
  scheduleRefresh: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const THROTTLE_MS = 500;

export function RealtimeProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const client = useMemo(() => getBrowserSupabaseClient(), []);
  const [status, setStatus] = useState<RealtimeStatus | 'CONNECTING'>('CONNECTING');

  // Throttle refreshes: fire immediately, then coalesce a trailing one.
  // Prevents a burst of events (e.g. bulk inserts) from refetch-storming.
  const lastRun = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useMemo(() => {
    return () => {
      const now = Date.now();
      const since = now - lastRun.current;
      if (since >= THROTTLE_MS) {
        lastRun.current = now;
        router.refresh();
      } else if (!trailing.current) {
        trailing.current = setTimeout(() => {
          trailing.current = null;
          lastRun.current = Date.now();
          router.refresh();
        }, THROTTLE_MS - since);
      }
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    // Auth the socket, then subscribe. setAuth resolves with the token
    // applied; if there's no session the cookie client still carries it.
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const token = data.session?.access_token;
      if (token) void client.realtime.setAuth(token);
    });

    const unsubscribe = subscribeToMyGroups(
      client,
      userId,
      () => scheduleRefresh(),
      (s) => {
        if (active) setStatus(s);
      },
    );

    return () => {
      active = false;
      if (trailing.current) clearTimeout(trailing.current);
      unsubscribe();
    };
  }, [client, userId, scheduleRefresh]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ client, status, scheduleRefresh }),
    [client, status, scheduleRefresh],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}
