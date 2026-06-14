import { useState } from 'react';
import { Stack, Redirect, useSegments, usePathname, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';

/**
 * Deep link captured while the user was signed out (e.g. an invite
 * URL). Mobile equivalent of the web proxy's ?next= round-trip: when
 * GatedStack bounces a signed-out user to /sign-in, it stashes the
 * intended path here and resumes it once authentication completes.
 * Module scope (not state) on purpose — it must survive the re-renders
 * and unmounts that happen across the auth transition.
 */
let pendingPath: string | null = null;

export default function RootLayout() {
  // One QueryClient for the app's lifetime. useState (not a module
  // global) keeps Fast Refresh from sharing a cache across reloads.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Mobile sessions are long-lived; don't refetch on every
            // focus change. Mutations invalidate what they touch.
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GatedStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Inner stack that reads auth state and redirects appropriately.
 *
 * Mobile equivalent of the Next.js proxy. Reads from the AuthContext
 * and uses Expo Router's <Redirect> to enforce the right destination
 * for each combination of (signed-in, needsOnboarding, currentSegment).
 */
function GatedStack() {
  const { session, needsOnboarding, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  // Use array helpers instead of positional indexing so we don't trip
  // over noUncheckedIndexedAccess / typed-routes tuple narrowing.
  const segmentList = segments as readonly string[];
  const inAuthGroup = segmentList[0] === '(auth)';
  const onOnboarding = segmentList.includes('onboarding');

  // Unauthenticated user not on an auth screen → /sign-in.
  // Stash the intended path (deep links, e.g. /invites/<token>) so it
  // can resume after sign-in / sign-up.
  if (!session && !inAuthGroup) {
    if (pathname && pathname !== '/') {
      pendingPath = pathname;
    }
    return <Redirect href="/sign-in" />;
  }
  // Onboarding requires a session; bounce signed-out users to sign-in
  if (!session && onOnboarding) {
    return <Redirect href="/sign-in" />;
  }

  // Authenticated, needs onboarding, not already there → /onboarding.
  // (pendingPath intentionally survives onboarding — it resumes below.)
  if (session && needsOnboarding && !onOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  // Authenticated, onboarded, but sitting on an auth screen → resume
  // the stashed deep link if there is one, otherwise home.
  if (session && !needsOnboarding && inAuthGroup) {
    const target = pendingPath ?? '/';
    pendingPath = null;
    return <Redirect href={target as Href} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f6fd',
  },
});
