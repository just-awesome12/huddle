import { useState } from 'react';
import { Stack, Redirect, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';

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

  // Unauthenticated user not on an auth screen → /sign-in
  if (!session && !inAuthGroup) {
    return <Redirect href="/sign-in" />;
  }
  // Onboarding requires a session; bounce signed-out users to sign-in
  if (!session && onOnboarding) {
    return <Redirect href="/sign-in" />;
  }

  // Authenticated, needs onboarding, not already there → /onboarding
  if (session && needsOnboarding && !onOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  // Authenticated, onboarded, but sitting on an auth screen → /
  if (session && !needsOnboarding && inAuthGroup) {
    return <Redirect href="/" />;
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
    backgroundColor: '#f8fafc',
  },
});
