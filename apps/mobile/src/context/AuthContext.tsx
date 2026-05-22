import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@huddle/api-client/native';
import { supabase } from '@/lib/supabase';

/**
 * Auth context.
 *
 * Tracks three things:
 *   - The Supabase session (null while signed out, or before initial load)
 *   - The user's profile row (specifically the username — we use this
 *     to decide whether to send them to onboarding)
 *   - A loading flag for the initial session+profile fetch on app launch
 *
 * Consumers use the `useAuth()` hook to read state. The provider
 * listens for Supabase auth-state changes and re-fetches the profile
 * whenever the session changes.
 */

const PLACEHOLDER_USERNAME_RE = /^u_[0-9a-f]{12}$/;

export interface AuthState {
  session: Session | null;
  username: string | null;
  loading: boolean;
  needsOnboarding: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<void> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] profile fetch failed', error);
      setUsername(null);
      return;
    }
    setUsername(data?.username ?? null);
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user.id) {
        await fetchProfile(data.session.user.id);
      }
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!mounted) return;
      setSession(next);
      if (next?.user.id) {
        await fetchProfile(next.user.id);
      } else {
        setUsername(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      username,
      loading,
      needsOnboarding:
        !!session && (username === null || PLACEHOLDER_USERNAME_RE.test(username)),
      refreshProfile: async () => {
        if (session?.user.id) await fetchProfile(session.user.id);
      },
    }),
    [session, username, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
